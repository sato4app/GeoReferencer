// ジオリファレンシング（画像重ね合わせ）機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';
import { coordinateTransforms } from './coordinate-transforms.js';
import { matrixUtils } from './matrix-utils.js';

export class Georeferencing {
    constructor(mapCore, imageOverlay, gpsData) {
        this.logger = new Logger('Georeferencing');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.gpsData = gpsData;
        this.pointJsonData = null;
        this.currentTransformation = null;
        this.imageCoordinateMarkers = [];
        this.imageUpdateCallbackRegistered = false;
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

            if (matchResult.matchedPairs.length >= 3) {
                await this.performAutomaticGeoreferencing(matchResult.matchedPairs);
            } else {
                this.logger.error(`精密版ジオリファレンシングには最低3つのポイントが必要です。現在: ${matchResult.matchedPairs.length}ポイント`);
                throw new Error(`精密版ジオリファレンシングには最低3つのポイントが必要です。現在: ${matchResult.matchedPairs.length}ポイント`);
            }

            // 画像更新時のコールバックを登録（重複登録を防ぐ）
            if (!this.imageUpdateCallbackRegistered) {
                this.imageOverlay.addImageUpdateCallback(() => {
                    this.logger.info('★★★ 画像位置更新通知受信 - syncPointPositions実行 ★★★');
                    this.syncPointPositions();
                });
                this.imageUpdateCallbackRegistered = true;
                this.logger.info('画像更新コールバック登録完了');
            } else {
                this.logger.info('画像更新コールバックは既に登録済み');
            }

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
            this.logger.info('精密版ジオリファレンシング開始', matchedPairs.length + 'ペア');

            // 一致するポイント数をすべて使用（精密版のみ）
            const controlPoints = matchedPairs;
            this.logger.info(`使用ポイント数: ${controlPoints.length}個（全一致ポイント）`);
            
            const transformation = this.calculatePreciseAffineTransformation(controlPoints);
            
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




    calculatePreciseAffineTransformation(controlPoints) {
        try {
            this.logger.info(`精密アフィン変換開始: ${controlPoints.length}ポイント使用`);
            
            if (controlPoints.length < 3) {
                this.logger.error('精密アフィン変換には最低3つのポイントが必要です');
                return null;
            }

            // 一致するポイント数をすべて使用
            const usePoints = controlPoints;
            
            // 最小二乗法によるアフィン変換パラメータ計算
            const transformation = this.calculateLeastSquaresTransformation(usePoints);
            
            if (!transformation) {
                this.logger.error('精密変換計算に失敗');
                return null;
            }

            // 変換精度を計算
            const accuracy = this.calculateTransformationAccuracy(usePoints, transformation);
            
            const result = {
                type: 'precise',
                transformation: transformation,
                accuracy: accuracy,
                controlPoints: usePoints,
                usedPoints: usePoints.length
            };

            this.logger.info(`精密アフィン変換完了: 精度=${accuracy.meanError.toFixed(4)}m, 最大誤差=${accuracy.maxError.toFixed(4)}m`);
            
            return result;
            
        } catch (error) {
            this.logger.error('精密アフィン変換計算エラー', error);
            return null;
        }
    }

    calculateLeastSquaresTransformation(controlPoints) {
        return matrixUtils.calculateAffineTransformation(controlPoints, coordinateTransforms);
    }


    calculateTransformationAccuracy(controlPoints, transformation) {
        return matrixUtils.calculateTransformationAccuracy(controlPoints, transformation, coordinateTransforms);
    }

    async applyTransformationToImage(transformation, controlPoints) {
        try {
            if (transformation.type === 'precise') {
                await this.applyPreciseTransformation(transformation);
            } else {
                this.logger.error('精密版以外の変換はサポートされていません');
                return;
            }

            this.logger.info('精密版画像変換適用完了');

        } catch (error) {
            this.logger.error('画像変換適用エラー', error);
        }
    }

    async applyPreciseTransformation(transformation) {
        try {
            this.currentTransformation = transformation;

            this.logger.info('=== 精密変換適用開始 ===');
            
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            
            this.logger.info(`画像サイズ: ${imageWidth} x ${imageHeight}`);
            
            // 画像中心の座標を計算
            const imageCenterX = imageWidth / 2;
            const imageCenterY = imageHeight / 2;
            
            this.logger.info(`画像中心座標: (${imageCenterX}, ${imageCenterY})`);
            
            // アフィン変換で画像中心をGPS座標に変換
            const centerWebMercatorX = transformation.transformation.a * imageCenterX + 
                                      transformation.transformation.b * imageCenterY + 
                                      transformation.transformation.c;
            const centerWebMercatorY = transformation.transformation.d * imageCenterX + 
                                      transformation.transformation.e * imageCenterY + 
                                      transformation.transformation.f;
            
            this.logger.info(`画像中心のWeb Mercator座標: (${centerWebMercatorX}, ${centerWebMercatorY})`);
            
            const centerLat = coordinateTransforms.webMercatorYToLat(centerWebMercatorY);
            const centerLng = coordinateTransforms.webMercatorXToLon(centerWebMercatorX);

            this.logger.info(`画像中心のGPS座標: [${centerLat}, ${centerLng}]`);
            this.logger.info(`精度情報:`, transformation.accuracy);

            // 中心位置を設定
            this.imageOverlay.setCenterPosition([centerLat, centerLng]);
            
            // スケール計算（制御点ベース）
            const scale = this.calculateScaleFromTransformation(transformation);
            this.logger.info(`適用スケール: ${scale}`);
            
            this.imageOverlay.setCurrentScale(scale);
            this.imageOverlay.updateImageDisplay();
            
            await this.updatePointJsonMarkersAfterTransformation();

            this.logger.info('=== 精密変換適用完了 ===');

        } catch (error) {
            this.logger.error('精密変換適用エラー', error);
            throw error;
        }
    }

    calculateScaleFromTransformation(transformation) {
        try {
            const controlPoints = transformation.controlPoints;
            if (controlPoints && controlPoints.length >= 2) {
                const point1 = controlPoints[0];
                const point2 = controlPoints[1];
                
                // 画像上の距離（ピクセル）
                const imageDistanceX = point2.pointJson.imageX - point1.pointJson.imageX;
                const imageDistanceY = point2.pointJson.imageY - point1.pointJson.imageY;
                const imageDistance = Math.sqrt(imageDistanceX * imageDistanceX + imageDistanceY * imageDistanceY);
                
                // GPS上の実距離（メートル）
                const gpsDistance = coordinateTransforms.calculateGpsDistance(
                    point1.gpsPoint.lat, point1.gpsPoint.lng,
                    point2.gpsPoint.lat, point2.gpsPoint.lng
                );
                
                if (imageDistance === 0 || gpsDistance === 0) {
                    return this.imageOverlay.getDefaultScale();
                }
                
                // 実測スケール（メートル/ピクセル）
                const realWorldScale = gpsDistance / imageDistance;
                
                // 現在のズームレベルでの地図解像度
                const centerPos = this.mapCore.getMap().getCenter();
                const currentZoom = this.mapCore.getMap().getZoom();
                const metersPerPixelAtCenter = coordinateTransforms.calculateMetersPerPixel(centerPos.lat, currentZoom);
                
                return realWorldScale / metersPerPixelAtCenter;
                
            } else {
                return this.imageOverlay.getDefaultScale();
            }
            
        } catch (error) {
            this.logger.error('スケール計算エラー', error);
            return this.imageOverlay.getDefaultScale();
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
                const data = markerInfo.data;  // dataから直接取得
                
                if (!data || data.imageX === undefined || data.imageY === undefined) {
                    this.logger.warn('マーカーの画像座標データが不足しています', data);
                    continue;
                }

                const transformedGpsCoords = this.transformImageCoordsToGps(
                    data.imageX, 
                    data.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    marker.setLatLng(transformedGpsCoords);
                    const updatedPopupContent = this.createUpdatedPopupContent({
                        imageX: data.imageX,
                        imageY: data.imageY,
                        name: data.name || data.id
                    }, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            this.logger.info('ポイントJSONマーカー位置更新完了');
            
            // 追加: 確実にポイント位置同期を実行
            this.syncPointPositions();
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー位置更新エラー', error);
        }
    }



    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            this.logger.debug(`座標変換開始: 画像座標(${imageX}, ${imageY}), 変換方式: ${transformation.type}`);
            
            if (transformation.type === 'precise') {
                const result = coordinateTransforms.applyAffineTransform(imageX, imageY, transformation);
                if (result) {
                    this.logger.debug(`精密版変換結果: GPS(${result[0].toFixed(6)}, ${result[1].toFixed(6)})`);
                }
                return result;
            } else {
                this.logger.error('精密版以外の変換はサポートされていません');
                return null;
            }
            
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
            this.logger.info('=== ポイント位置同期処理開始 ===');
            
            if (!this.currentTransformation) {
                this.logger.info('変換パラメータがないため、画像境界ベースの位置更新を実行');
                // ジオリファレンス変換が適用されていない場合は、画像境界ベースで更新
                this.syncPointPositionsBasedOnImageBounds();
                return;
            }

            this.logger.info('現在の変換情報:', {
                type: this.currentTransformation.type,
                totalMarkers: this.imageCoordinateMarkers.length
            });

            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );

            this.logger.info(`フィルタ後のマーカー: ${georefMarkers.length}個`);

            georefMarkers.forEach((markerInfo, index) => {
                const marker = markerInfo.marker;
                const data = markerInfo.data;  // ポップアップではなくmarkerInfo.dataから直接取得
                
                if (!data || data.imageX === undefined || data.imageY === undefined) {
                    this.logger.warn(`マーカー${index}: 画像座標データが見つかりません`, data);
                    return;
                }

                this.logger.debug(`マーカー${index}: 画像座標(${data.imageX}, ${data.imageY}) - ${data.name || data.id}`);

                // 現在の変換を使って新しい座標を計算
                const transformedGpsCoords = this.transformImageCoordsToGps(
                    data.imageX, 
                    data.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    const oldPos = marker.getLatLng();
                    this.logger.info(`マーカー${index}: ${data.name || data.id} 位置更新 [${oldPos.lat.toFixed(6)}, ${oldPos.lng.toFixed(6)}] → [${transformedGpsCoords[0].toFixed(6)}, ${transformedGpsCoords[1].toFixed(6)}]`);
                    
                    // マーカーの位置を更新
                    marker.setLatLng(transformedGpsCoords);
                    
                    // ポップアップ内容も更新（元の画像座標を保持）
                    const updatedPopupContent = this.createUpdatedPopupContent({
                        imageX: data.imageX,
                        imageY: data.imageY,
                        name: data.name || data.id
                    }, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                } else {
                    this.logger.warn(`マーカー${index}: 座標変換に失敗`);
                }
            });
            
            this.logger.info(`=== ポイント位置同期完了: ${georefMarkers.length}個更新 ===`);
            
        } catch (error) {
            this.logger.error('ポイント位置同期エラー', error);
        }
    }

    // 画像境界ベースの位置同期（ジオリファレンス未適用時）
    syncPointPositionsBasedOnImageBounds() {
        try {
            this.logger.info('=== 画像境界ベース位置同期処理開始 ===');

            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );

            this.logger.info(`対象マーカー: ${georefMarkers.length}個`);

            georefMarkers.forEach((markerInfo, index) => {
                const marker = markerInfo.marker;
                const data = markerInfo.data;

                if (data && data.imageX !== undefined && data.imageY !== undefined) {
                    // CoordinateDisplayクラスの変換メソッドを使用
                    const coordinateDisplay = this.getCoordinateDisplay();
                    if (coordinateDisplay) {
                        const newLatLng = coordinateDisplay.convertImageToLatLng(data.imageX, data.imageY);
                        const oldPos = marker.getLatLng();
                        
                        this.logger.info(`マーカー${index}: ${data.name || data.id} 画像境界ベース更新 [${oldPos.lat.toFixed(6)}, ${oldPos.lng.toFixed(6)}] → [${newLatLng[0].toFixed(6)}, ${newLatLng[1].toFixed(6)}]`);
                        
                        marker.setLatLng(newLatLng);
                        
                        // ポップアップ内容も更新（画像座標を保持）
                        const updatedPopupContent = `
                            <div>
                                <strong>${data.name || data.id}</strong><br>
                                画像座標: (${data.imageX}, ${data.imageY})<br>
                                現在のGPS: (${newLatLng[0].toFixed(6)}, ${newLatLng[1].toFixed(6)})<br>
                                <small>画像境界ベース変換</small>
                            </div>
                        `;
                        marker.bindPopup(updatedPopupContent);
                    }
                }
            });

            this.logger.info(`=== 画像境界ベース位置同期完了: ${georefMarkers.length}個更新 ===`);

        } catch (error) {
            this.logger.error('画像境界ベース位置同期エラー', error);
        }
    }

    // CoordinateDisplayインスタンスを取得（app-main.jsから注入）
    setCoordinateDisplay(coordinateDisplay) {
        this.coordinateDisplay = coordinateDisplay;
    }

    getCoordinateDisplay() {
        return this.coordinateDisplay;
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