// ジオリファレンシング（画像重ね合わせ）機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';

export class Georeferencing {
    constructor(mapCore, imageOverlay, gpsData) {
        this.logger = new Logger('Georeferencing');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.gpsData = gpsData;
        this.pointJsonData = null;
        this.currentTransformation = null;
        this.imageCoordinateMarkers = [];
    }

    async executeGeoreferencing() {
        try {
            const currentBounds = this.imageOverlay.getInitialBounds();
            this.logger.debug('初期境界設定完了', currentBounds);
            
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            
            if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
                throw new Error('画像のピクセル寸法を取得できません。');
            }

            const centerPos = this.mapCore.getMap().getCenter();
            const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());
            
            if (!isFinite(metersPerPixel) || metersPerPixel <= 0) {
                throw new Error('座標変換パラメータの計算に失敗しました。');
            }

            const scale = this.imageOverlay.getCurrentScale();
            const scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
            const scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
            
            const earthRadius = 6378137;
            const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
            const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * Math.cos(centerPos.lat * Math.PI / 180)) * (180 / Math.PI);
            
            if (!isFinite(latOffset) || !isFinite(lngOffset)) {
                throw new Error('地理座標の計算に失敗しました。');
            }

            this.logger.debug('ジオリファレンス計算完了', {
                imageSize: { width: imageWidth, height: imageHeight },
                metersPerPixel,
                scale,
                offsets: { lat: latOffset, lng: lngOffset }
            });

            this.imageOverlay.updateImageDisplay();
            
        } catch (error) {
            this.logger.error('ジオリファレンス実行エラー', error);
            throw error;
        }
    }

    setupGeoreferencingUI() {
        try {
            if (!this.mapCore.getMap().hasLayer(this.imageOverlay.centerMarker)) {
                this.imageOverlay.centerMarker.addTo(this.mapCore.getMap());
            }

            if (!this.mapCore.getMap().getPane('centerMarker')) {
                this.mapCore.getMap().createPane('centerMarker');
                this.mapCore.getMap().getPane('centerMarker').style.zIndex = 650;
            }
            
            if (!this.mapCore.getMap().getPane('dragHandles')) {
                this.mapCore.getMap().createPane('dragHandles');
                this.mapCore.getMap().getPane('dragHandles').style.zIndex = 660;
            }

            this.logger.debug('ジオリファレンスUI設定完了');
            
        } catch (error) {
            this.logger.error('ジオリファレンスUI設定エラー', error);
        }
    }

    async performGeoreferencingCalculations() {
        try {
            const gpsPoints = this.gpsData.getPoints();
            const matchResult = this.matchPointJsonWithGPS(gpsPoints);

            if (matchResult.matchedPairs.length >= 2) {
                await this.performAutomaticGeoreferencing(matchResult.matchedPairs);
            } else if (matchResult.matchedPairs.length === 1) {
                await this.centerImageOnSinglePoint(matchResult.matchedPairs[0]);
            }

            this.imageOverlay.addImageUpdateCallback(() => {
                this.logger.debug('画像位置更新通知受信');
                this.syncPointPositions();
            });

            return {
                matchedCount: matchResult.matchedPairs.length,
                unmatchedPoints: matchResult.unmatchedPointJsonIds,
                totalPoints: gpsPoints.length,
                totalPointJsons: matchResult.totalPointJsons,
                matchedPairs: matchResult.matchedPairs,
                georeferenceCompleted: true
            };
            
        } catch (error) {
            this.logger.error('ジオリファレンス計算エラー', error);
            throw error;
        }
    }

    async performAutomaticGeoreferencing(matchedPairs) {
        try {
            this.logger.info('自動ジオリファレンシング開始', matchedPairs.length + 'ペア');

            const controlPoints = matchedPairs.slice(0, 4);
            const transformation = this.calculateAffineTransformation(controlPoints);
            
            if (transformation) {
                await this.applyTransformationToImage(transformation, controlPoints);
                this.logger.info('自動ジオリファレンシング完了');
            } else {
                this.logger.warn('変換パラメータの計算に失敗しました');
            }

        } catch (error) {
            this.logger.error('自動ジオリファレンシングエラー', error);
            throw error;
        }
    }

    async centerImageOnSinglePoint(matchedPair) {
        try {
            this.logger.info('単一ポイント中心合わせ開始', matchedPair.pointJsonId);

            const gpsLat = matchedPair.gpsPoint.lat;
            const gpsLng = matchedPair.gpsPoint.lng;

            this.currentTransformation = {
                type: 'center_only',
                targetPointImageX: matchedPair.pointJson.imageX,
                targetPointImageY: matchedPair.pointJson.imageY,
                targetPointGpsLat: gpsLat,
                targetPointGpsLng: gpsLng
            };

            this.imageOverlay.setCenterPosition([gpsLat, gpsLng]);
            await this.updatePointJsonMarkersAfterCentering();

            this.logger.info('単一ポイント中心合わせ完了');

        } catch (error) {
            this.logger.error('単一ポイント中心合わせエラー', error);
        }
    }

    calculateAffineTransformation(controlPoints) {
        try {
            if (controlPoints.length < 2) {
                this.logger.warn('アフィン変換には最低2つのコントロールポイントが必要です');
                return null;
            }

            if (controlPoints.length === 2) {
                return this.calculateSimpleTransformation(controlPoints);
            }

            return this.calculateFullAffineTransformation(controlPoints);

        } catch (error) {
            this.logger.error('アフィン変換計算エラー', error);
            return null;
        }
    }

    calculateSimpleTransformation(controlPoints) {
        try {
            const point1 = controlPoints[0];
            const point2 = controlPoints[1];

            const imageDistanceX = point2.pointJson.imageX - point1.pointJson.imageX;
            const imageDistanceY = point2.pointJson.imageY - point1.pointJson.imageY;
            const imageDistance = Math.sqrt(imageDistanceX * imageDistanceX + imageDistanceY * imageDistanceY);

            const gpsDistance = this.mapCore.getMap().distance(
                [point1.gpsPoint.lat, point1.gpsPoint.lng],
                [point2.gpsPoint.lat, point2.gpsPoint.lng]
            );

            if (imageDistance === 0 || gpsDistance === 0) {
                this.logger.warn('距離が0のため変換計算できません');
                return null;
            }

            const scale = gpsDistance / imageDistance;
            
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            const actualImageCenterX = imageWidth / 2;
            const actualImageCenterY = imageHeight / 2;

            const referencePoint = point1;
            const deltaX = actualImageCenterX - referencePoint.pointJson.imageX;
            const deltaY = actualImageCenterY - referencePoint.pointJson.imageY;

            const earthRadius = 6378137;
            const centerLat = referencePoint.gpsPoint.lat;
            const cosLat = Math.cos(centerLat * Math.PI / 180);
            
            const latOffset = (deltaY * scale) / earthRadius * (180 / Math.PI);
            const lngOffset = (deltaX * scale) / (earthRadius * cosLat) * (180 / Math.PI);

            const imageCenterGpsLat = referencePoint.gpsPoint.lat - latOffset;
            const imageCenterGpsLng = referencePoint.gpsPoint.lng + lngOffset;

            this.logger.info('変換パラメータ詳細', {
                referencePoint: `${referencePoint.pointJsonId} - Image:(${referencePoint.pointJson.imageX}, ${referencePoint.pointJson.imageY}) GPS:(${referencePoint.gpsPoint.lat}, ${referencePoint.gpsPoint.lng})`,
                imageSize: `${imageWidth}x${imageHeight}`,
                actualImageCenter: `(${actualImageCenterX}, ${actualImageCenterY})`,
                scale: scale,
                calculatedCenter: `GPS:(${imageCenterGpsLat}, ${imageCenterGpsLng})`
            });

            return {
                type: 'simple',
                scale: scale,
                centerImageX: actualImageCenterX,
                centerImageY: actualImageCenterY,
                centerGpsLat: imageCenterGpsLat,
                centerGpsLng: imageCenterGpsLng,
                controlPoints: controlPoints
            };

        } catch (error) {
            this.logger.error('簡易変換計算エラー', error);
            return null;
        }
    }

    calculateFullAffineTransformation(controlPoints) {
        try {
            this.logger.info('フルアフィン変換を簡易版で実行');
            return this.calculateSimpleTransformation(controlPoints.slice(0, 2));
        } catch (error) {
            this.logger.error('フルアフィン変換計算エラー', error);
            return null;
        }
    }

    async applyTransformationToImage(transformation, controlPoints) {
        try {
            if (transformation.type === 'simple') {
                await this.applySimpleTransformation(transformation);
            }

            this.logger.info('画像変換適用完了');

        } catch (error) {
            this.logger.error('画像変換適用エラー', error);
        }
    }

    async applySimpleTransformation(transformation) {
        try {
            this.currentTransformation = transformation;

            this.imageOverlay.setCenterPosition([
                transformation.centerGpsLat, 
                transformation.centerGpsLng
            ]);

            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageWidth || !imageHeight) {
                throw new Error('画像サイズの取得に失敗しました');
            }

            const centerPos = [transformation.centerGpsLat, transformation.centerGpsLng];
            const metersPerPixel = 156543.03392 * Math.cos(centerPos[0] * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());

            const newScale = transformation.scale / metersPerPixel;

            this.logger.info('変換パラメータ', {
                centerGps: centerPos,
                scale: transformation.scale,
                metersPerPixel: metersPerPixel,
                newScale: newScale
            });

            this.imageOverlay.setCurrentScale(newScale);
            this.imageOverlay.updateImageDisplay();
            await this.updatePointJsonMarkersAfterTransformation();

        } catch (error) {
            this.logger.error('簡易変換適用エラー', error);
            throw error;
        }
    }

    matchPointJsonWithGPS(gpsPoints) {
        try {
            const matchedPairs = [];
            const unmatchedPointJsonIds = [];
            let totalPointJsons = 0;

            if (!this.pointJsonData) {
                this.logger.warn('ポイントJSONデータが存在しません');
                return {
                    matchedPairs: [],
                    unmatchedPointJsonIds: [],
                    totalPointJsons: 0
                };
            }

            const pointJsonArray = Array.isArray(this.pointJsonData) ? this.pointJsonData : 
                (this.pointJsonData.points ? this.pointJsonData.points : [this.pointJsonData]);

            totalPointJsons = pointJsonArray.length;

            const gpsPointMap = new Map();
            gpsPoints.forEach(gpsPoint => {
                gpsPointMap.set(gpsPoint.pointId, gpsPoint);
            });

            pointJsonArray.forEach((pointJson, index) => {
                const pointJsonId = pointJson.Id || pointJson.id || pointJson.name;
                
                if (!pointJsonId) {
                    this.logger.warn(`ポイントJSON[${index}]にIdが見つかりません:`, pointJson);
                    unmatchedPointJsonIds.push(`[${index}] (IDなし)`);
                    return;
                }

                const matchingGpsPoint = gpsPointMap.get(pointJsonId);

                if (matchingGpsPoint) {
                    const pair = {
                        pointJsonId: pointJsonId,
                        pointJson: pointJson,
                        gpsPoint: matchingGpsPoint
                    };
                    matchedPairs.push(pair);
                } else {
                    unmatchedPointJsonIds.push(pointJsonId);
                }
            });

            return {
                matchedPairs,
                unmatchedPointJsonIds,
                totalPointJsons
            };

        } catch (error) {
            this.logger.error('IDマッチング処理エラー', error);
            return {
                matchedPairs: [],
                unmatchedPointJsonIds: [],
                totalPointJsons: 0
            };
        }
    }

    async updatePointJsonMarkersAfterTransformation() {
        try {
            if (!this.currentTransformation || !this.imageCoordinateMarkers || this.imageCoordinateMarkers.length === 0) {
                this.logger.debug('変換パラメータまたはポイントJSONマーカーが存在しません');
                return;
            }

            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );

            this.logger.info('ポイントJSONマーカー位置更新開始', georefMarkers.length + '個');

            for (const markerInfo of georefMarkers) {
                const marker = markerInfo.marker;
                
                const pointInfo = this.getPointInfoFromMarker(marker);
                if (!pointInfo) continue;

                const transformedGpsCoords = this.transformImageCoordsToGps(
                    pointInfo.imageX, 
                    pointInfo.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    marker.setLatLng(transformedGpsCoords);
                    const updatedPopupContent = this.createUpdatedPopupContent(pointInfo, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            this.logger.info('ポイントJSONマーカー位置更新完了');
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー位置更新エラー', error);
        }
    }

    async updatePointJsonMarkersAfterCentering() {
        try {
            if (!this.currentTransformation || !this.imageCoordinateMarkers || this.imageCoordinateMarkers.length === 0) {
                this.logger.debug('変換パラメータまたはポイントJSONマーカーが存在しません');
                return;
            }

            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );

            this.logger.info('ポイントJSONマーカー中心移動更新開始', georefMarkers.length + '個');

            for (const markerInfo of georefMarkers) {
                const marker = markerInfo.marker;
                
                const pointInfo = this.getPointInfoFromMarker(marker);
                if (!pointInfo) continue;

                const transformedGpsCoords = this.transformImageCoordsToGps(
                    pointInfo.imageX, 
                    pointInfo.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    marker.setLatLng(transformedGpsCoords);
                    const updatedPopupContent = this.createUpdatedPopupContent(pointInfo, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            this.logger.info('ポイントJSONマーカー中心移動更新完了');
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー中心移動更新エラー', error);
        }
    }

    getPointInfoFromMarker(marker) {
        try {
            const popup = marker.getPopup();
            if (!popup) return null;

            const content = popup.getContent();
            if (!content) return null;

            const imageXMatch = content.match(/画像座標: \((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)/);
            if (!imageXMatch) return null;

            const nameMatch = content.match(/<strong>([^<]+)<\/strong>/);
            const name = nameMatch ? nameMatch[1] : 'Unknown';

            return {
                imageX: parseFloat(imageXMatch[1]),
                imageY: parseFloat(imageXMatch[2]),
                name: name
            };
            
        } catch (error) {
            this.logger.error('マーカー情報抽出エラー', error);
            return null;
        }
    }

    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            if (transformation.type === 'simple') {
                const deltaImageX = imageX - transformation.centerImageX;
                const deltaImageY = imageY - transformation.centerImageY;

                const earthRadius = 6378137;
                const latOffset = (deltaImageY * transformation.scale) / earthRadius * (180 / Math.PI);
                const lngOffset = (deltaImageX * transformation.scale) / (earthRadius * Math.cos(transformation.centerGpsLat * Math.PI / 180)) * (180 / Math.PI);

                const newLat = transformation.centerGpsLat - latOffset;
                const newLng = transformation.centerGpsLng + lngOffset;

                return [newLat, newLng];
                
            } else if (transformation.type === 'center_only') {
                const deltaImageX = imageX - transformation.targetPointImageX;
                const deltaImageY = imageY - transformation.targetPointImageY;

                const currentZoom = this.mapCore.getMap().getZoom();
                const metersPerPixel = 156543.03392 * Math.cos(transformation.targetPointGpsLat * Math.PI / 180) / Math.pow(2, currentZoom);
                const defaultScale = this.imageOverlay.getDefaultScale();
                
                const deltaMetersX = deltaImageX * defaultScale * metersPerPixel;
                const deltaMetersY = deltaImageY * defaultScale * metersPerPixel;

                const earthRadius = 6378137;
                const latOffset = deltaMetersY / earthRadius * (180 / Math.PI);
                const lngOffset = deltaMetersX / (earthRadius * Math.cos(transformation.targetPointGpsLat * Math.PI / 180)) * (180 / Math.PI);

                const newLat = transformation.targetPointGpsLat - latOffset;
                const newLng = transformation.targetPointGpsLng + lngOffset;

                return [newLat, newLng];
            }

            return null;
            
        } catch (error) {
            this.logger.error('座標変換エラー', error);
            return null;
        }
    }

    createUpdatedPopupContent(pointInfo, transformedCoords) {
        try {
            const [lat, lng] = transformedCoords;
            
            return `
                <div>
                    <strong>${pointInfo.name}</strong><br>
                    画像座標: (${pointInfo.imageX}, ${pointInfo.imageY})<br>
                    変換後GPS: (${lat.toFixed(6)}, ${lng.toFixed(6)})<br>
                    <small>ジオリファレンス変換適用済み</small>
                </div>
            `;
            
        } catch (error) {
            this.logger.error('ポップアップ内容作成エラー', error);
            return 'ポップアップ作成エラー';
        }
    }

    syncPointPositions() {
        try {
            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );

            georefMarkers.forEach(markerInfo => {
                // マーカーの座標を再計算して更新（必要に応じて実装）
            });
            
            this.logger.debug('ポイント位置同期完了');
            
        } catch (error) {
            this.logger.error('ポイント位置同期エラー', error);
        }
    }

    setPointJsonData(data) {
        this.pointJsonData = data;
    }

    addImageCoordinateMarker(markerInfo) {
        this.imageCoordinateMarkers.push(markerInfo);
    }

    clearImageCoordinateMarkers(markerType = 'all') {
        if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
            const markersToRemove = this.imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return true;
                return markerInfo.type === markerType;
            });

            markersToRemove.forEach(markerInfo => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(markerInfo.marker);
                }
            });

            this.imageCoordinateMarkers = this.imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return false;
                return markerInfo.type !== markerType;
            });
        }
    }
}