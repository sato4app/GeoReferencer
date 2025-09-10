// ジオリファレンシング（画像重ね合わせ）機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';

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

            if (matchResult.matchedPairs.length >= 2) {
                await this.performAutomaticGeoreferencing(matchResult.matchedPairs);
            } else if (matchResult.matchedPairs.length === 1) {
                await this.centerImageOnSinglePoint(matchResult.matchedPairs[0]);
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

            // 選択された変換方式を取得
            const selectedMode = document.querySelector('input[name="transformationMode"]:checked')?.value || 'auto';
            
            let transformationMode;
            if (selectedMode === 'auto') {
                // 自動選択：2ポイントなら簡易版、3ポイント以上なら精密版
                transformationMode = controlPoints.length === 2 ? 'simple' : 'precise';
            } else {
                transformationMode = selectedMode;
            }

            this.logger.info(`変換方式: ${transformationMode} (選択: ${selectedMode}, ポイント数: ${controlPoints.length})`);

            // 処理時間測定開始
            const startTime = performance.now();
            
            let result;
            if (transformationMode === 'simple' || controlPoints.length === 2) {
                result = this.calculateSimpleTransformation(controlPoints);
                result.method = 'simple';
            } else {
                result = this.calculatePreciseAffineTransformation(controlPoints);
                result.method = 'precise';
            }

            // 処理時間測定終了
            const endTime = performance.now();
            const processingTime = endTime - startTime;

            if (result) {
                result.processingTime = processingTime;
                result.controlPointsCount = controlPoints.length;
                
                this.logger.info(`変換計算完了: ${result.method}版, 処理時間: ${processingTime.toFixed(2)}ms`);
                
                // 結果をUIに表示
                this.displayTransformationResult(result);
            }

            return result;

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

    calculatePreciseAffineTransformation(controlPoints) {
        try {
            this.logger.info(`精密アフィン変換開始: ${controlPoints.length}ポイント使用`);
            
            if (controlPoints.length < 3) {
                this.logger.warn('精密アフィン変換には最低3つのポイントが必要です。簡易版にフォールバック');
                return this.calculateSimpleTransformation(controlPoints);
            }

            // 最適化: 最大6ポイントまで使用（計算精度とパフォーマンスのバランス）
            const usePoints = controlPoints.slice(0, Math.min(6, controlPoints.length));
            
            // 最小二乗法によるアフィン変換パラメータ計算
            const transformation = this.calculateLeastSquaresTransformation(usePoints);
            
            if (!transformation) {
                this.logger.warn('精密変換計算に失敗。簡易版にフォールバック');
                return this.calculateSimpleTransformation(controlPoints.slice(0, 2));
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
            // エラー時は簡易版にフォールバック
            return this.calculateSimpleTransformation(controlPoints.slice(0, 2));
        }
    }

    calculateLeastSquaresTransformation(controlPoints) {
        try {
            const n = controlPoints.length;
            
            // 連立方程式の係数行列を構築
            // アフィン変換: X = a*x + b*y + c, Y = d*x + e*y + f
            const A = new Array(2 * n).fill(0).map(() => new Array(6).fill(0));
            const B = new Array(2 * n).fill(0);

            for (let i = 0; i < n; i++) {
                const imageX = controlPoints[i].pointJson.imageX;
                const imageY = controlPoints[i].pointJson.imageY;
                const gpsX = this.lonToWebMercatorX(controlPoints[i].gpsPoint.lng);
                const gpsY = this.latToWebMercatorY(controlPoints[i].gpsPoint.lat);

                // X座標の方程式
                A[i * 2][0] = imageX;     // a
                A[i * 2][1] = imageY;     // b  
                A[i * 2][2] = 1;          // c
                A[i * 2][3] = 0;
                A[i * 2][4] = 0;
                A[i * 2][5] = 0;
                B[i * 2] = gpsX;

                // Y座標の方程式
                A[i * 2 + 1][0] = 0;
                A[i * 2 + 1][1] = 0;
                A[i * 2 + 1][2] = 0;
                A[i * 2 + 1][3] = imageX;  // d
                A[i * 2 + 1][4] = imageY;  // e
                A[i * 2 + 1][5] = 1;       // f
                B[i * 2 + 1] = gpsY;
            }

            // 正規方程式 (A^T * A) * x = A^T * B を解く
            const AtA = this.matrixMultiply(this.matrixTranspose(A), A);
            const AtB = this.matrixVectorMultiply(this.matrixTranspose(A), B);
            
            // ガウス・ジョーダン法で連立方程式を解く
            const params = this.gaussJordan(AtA, AtB);
            
            if (!params) {
                return null;
            }

            return {
                a: params[0], b: params[1], c: params[2],
                d: params[3], e: params[4], f: params[5]
            };

        } catch (error) {
            this.logger.error('最小二乗変換計算エラー', error);
            return null;
        }
    }

    // Web Mercator投影のヘルパー関数
    lonToWebMercatorX(lon) {
        return lon * 20037508.34 / 180;
    }

    latToWebMercatorY(lat) {
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        return y * 20037508.34 / 180;
    }

    webMercatorXToLon(x) {
        return x * 180 / 20037508.34;
    }

    webMercatorYToLat(y) {
        const lat = y * 180 / 20037508.34;
        return 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    }

    // 行列演算のヘルパー関数
    matrixTranspose(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }

    matrixMultiply(a, b) {
        const result = new Array(a.length).fill(0).map(() => new Array(b[0].length).fill(0));
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b[0].length; j++) {
                for (let k = 0; k < b.length; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    matrixVectorMultiply(matrix, vector) {
        return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
    }

    gaussJordan(A, B) {
        try {
            const n = A.length;
            const augmented = A.map((row, i) => [...row, B[i]]);

            // 前進消去
            for (let i = 0; i < n; i++) {
                // ピボット選択
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                        maxRow = k;
                    }
                }
                [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

                // 対角要素が0の場合は特異行列
                if (Math.abs(augmented[i][i]) < 1e-10) {
                    this.logger.warn('特異行列のため解けません');
                    return null;
                }

                // 正規化
                const pivot = augmented[i][i];
                for (let j = i; j <= n; j++) {
                    augmented[i][j] /= pivot;
                }

                // 消去
                for (let k = 0; k < n; k++) {
                    if (k !== i) {
                        const factor = augmented[k][i];
                        for (let j = i; j <= n; j++) {
                            augmented[k][j] -= factor * augmented[i][j];
                        }
                    }
                }
            }

            // 解を取り出す
            return augmented.map(row => row[n]);

        } catch (error) {
            this.logger.error('ガウス・ジョーダン法エラー', error);
            return null;
        }
    }

    calculateTransformationAccuracy(controlPoints, transformation) {
        try {
            const errors = [];
            
            for (const point of controlPoints) {
                const imageX = point.pointJson.imageX;
                const imageY = point.pointJson.imageY;
                
                // 変換後座標を計算
                const transformedX = transformation.a * imageX + transformation.b * imageY + transformation.c;
                const transformedY = transformation.d * imageX + transformation.e * imageY + transformation.f;
                
                // 実際のGPS座標（Web Mercator）
                const actualX = this.lonToWebMercatorX(point.gpsPoint.lng);
                const actualY = this.latToWebMercatorY(point.gpsPoint.lat);
                
                // 誤差計算（メートル単位）
                const errorDistance = Math.sqrt(
                    Math.pow(transformedX - actualX, 2) + 
                    Math.pow(transformedY - actualY, 2)
                );
                
                errors.push(errorDistance);
            }
            
            const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
            const maxError = Math.max(...errors);
            const minError = Math.min(...errors);
            
            return {
                meanError,
                maxError,
                minError,
                errors
            };
            
        } catch (error) {
            this.logger.error('精度計算エラー', error);
            return { meanError: 0, maxError: 0, minError: 0, errors: [] };
        }
    }

    async applyTransformationToImage(transformation, controlPoints) {
        try {
            if (transformation.type === 'simple') {
                await this.applySimpleTransformation(transformation);
            } else if (transformation.type === 'precise') {
                await this.applyPreciseTransformation(transformation);
            }

            this.logger.info('画像変換適用完了');

        } catch (error) {
            this.logger.error('画像変換適用エラー', error);
        }
    }

    async applyPreciseTransformation(transformation) {
        try {
            this.currentTransformation = transformation;

            // 精密変換では画像の中心位置を最適化された位置に設定
            // とりあえず最初のコントロールポイントから画像中心を逆算
            const firstPoint = transformation.controlPoints[0];
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            
            // 画像中心の座標を計算
            const imageCenterX = imageWidth / 2;
            const imageCenterY = imageHeight / 2;
            
            // アフィン変換で画像中心をGPS座標に変換
            const centerWebMercatorX = transformation.transformation.a * imageCenterX + 
                                      transformation.transformation.b * imageCenterY + 
                                      transformation.transformation.c;
            const centerWebMercatorY = transformation.transformation.d * imageCenterX + 
                                      transformation.transformation.e * imageCenterY + 
                                      transformation.transformation.f;
            
            const centerLat = this.webMercatorYToLat(centerWebMercatorY);
            const centerLng = this.webMercatorXToLon(centerWebMercatorX);

            this.logger.info('精密変換適用', {
                centerGps: [centerLat, centerLng],
                accuracy: transformation.accuracy
            });

            this.imageOverlay.setCenterPosition([centerLat, centerLng]);
            
            // スケールは簡易版の計算方法を流用
            const scale = this.calculateScaleFromTransformation(transformation);
            this.imageOverlay.setCurrentScale(scale);
            this.imageOverlay.updateImageDisplay();
            
            await this.updatePointJsonMarkersAfterTransformation();

        } catch (error) {
            this.logger.error('精密変換適用エラー', error);
            throw error;
        }
    }

    calculateScaleFromTransformation(transformation) {
        try {
            // アフィン変換行列からスケール因子を抽出
            const a = transformation.transformation.a;
            const b = transformation.transformation.b;
            const d = transformation.transformation.d;
            const e = transformation.transformation.e;
            
            // X方向とY方向のスケールを計算
            const scaleX = Math.sqrt(a * a + d * d);
            const scaleY = Math.sqrt(b * b + e * e);
            
            // 平均スケールを使用
            const averageScale = (scaleX + scaleY) / 2;
            
            // Web Mercatorからピクセルスケールに変換
            const centerPos = this.mapCore.getMap().getCenter();
            const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());
            
            const pixelScale = averageScale / metersPerPixel;
            
            return pixelScale;
            
        } catch (error) {
            this.logger.error('スケール計算エラー', error);
            return this.imageOverlay.getDefaultScale();
        }
    }

    displayTransformationResult(result) {
        try {
            const transformationResultField = document.getElementById('transformationResultField');
            if (!transformationResultField) return;

            let resultText = `変換方式: ${result.method === 'simple' ? '簡易版' : '精密版'}\n`;
            resultText += `処理時間: ${result.processingTime.toFixed(2)}ms\n`;
            resultText += `使用ポイント数: ${result.controlPointsCount}個\n\n`;

            if (result.method === 'simple') {
                resultText += `簡易版 - 2点間距離ベース変換\n`;
                if (result.controlPoints && result.controlPoints.length >= 2) {
                    const point1 = result.controlPoints[0];
                    const point2 = result.controlPoints[1];
                    resultText += `基準点1: ${point1.pointJsonId}\n`;
                    resultText += `基準点2: ${point2.pointJsonId}\n`;
                }
                resultText += `スケール: ${result.scale ? result.scale.toFixed(6) : 'N/A'}`;
            } else {
                resultText += `精密版 - 最小二乗法アフィン変換\n`;
                if (result.accuracy) {
                    resultText += `平均誤差: ${result.accuracy.meanError.toFixed(2)}m\n`;
                    resultText += `最大誤差: ${result.accuracy.maxError.toFixed(2)}m\n`;
                    resultText += `最小誤差: ${result.accuracy.minError.toFixed(2)}m\n`;
                }
                if (result.transformation) {
                    resultText += `変換係数:\n`;
                    resultText += `a=${result.transformation.a.toFixed(6)}\n`;
                    resultText += `b=${result.transformation.b.toFixed(6)}\n`;
                    resultText += `d=${result.transformation.d.toFixed(6)}\n`;
                    resultText += `e=${result.transformation.e.toFixed(6)}`;
                }
            }

            transformationResultField.value = resultText;
            this.logger.debug('変換結果表示完了');
            
        } catch (error) {
            this.logger.error('変換結果表示エラー', error);
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
            
            // 追加: 確実にポイント位置同期を実行
            this.syncPointPositions();
            
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
            
            // 追加: 確実にポイント位置同期を実行
            this.syncPointPositions();
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー中心移動更新エラー', error);
        }
    }

    getPointInfoFromMarker(marker) {
        try {
            const popup = marker.getPopup();
            if (!popup) {
                this.logger.warn('マーカーにポップアップがありません');
                return null;
            }

            const content = popup.getContent();
            if (!content) {
                this.logger.warn('ポップアップにコンテンツがありません');
                return null;
            }

            this.logger.debug('ポップアップ内容:', content);

            const imageXMatch = content.match(/画像座標: \((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)/);
            if (!imageXMatch) {
                this.logger.warn('画像座標の正規表現マッチに失敗:', content);
                return null;
            }

            const nameMatch = content.match(/<strong>([^<]+)<\/strong>/);
            const name = nameMatch ? nameMatch[1] : 'Unknown';

            const result = {
                imageX: parseFloat(imageXMatch[1]),
                imageY: parseFloat(imageXMatch[2]),
                name: name
            };

            this.logger.debug('抽出されたポイント情報:', result);
            return result;
            
        } catch (error) {
            this.logger.error('マーカー情報抽出エラー', error);
            return null;
        }
    }

    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            this.logger.debug(`座標変換開始: 画像座標(${imageX}, ${imageY}), 変換方式: ${transformation.type}`);
            
            if (transformation.type === 'simple') {
                const deltaImageX = imageX - transformation.centerImageX;
                const deltaImageY = imageY - transformation.centerImageY;

                const earthRadius = 6378137;
                const latOffset = (deltaImageY * transformation.scale) / earthRadius * (180 / Math.PI);
                const lngOffset = (deltaImageX * transformation.scale) / (earthRadius * Math.cos(transformation.centerGpsLat * Math.PI / 180)) * (180 / Math.PI);

                const newLat = transformation.centerGpsLat - latOffset;
                const newLng = transformation.centerGpsLng + lngOffset;

                this.logger.debug(`簡易版変換結果: GPS(${newLat.toFixed(6)}, ${newLng.toFixed(6)})`);
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

                this.logger.debug(`中心のみ変換結果: GPS(${newLat.toFixed(6)}, ${newLng.toFixed(6)})`);
                return [newLat, newLng];
            } else if (transformation.type === 'precise') {
                // 精密版: アフィン変換を使用
                const trans = transformation.transformation;
                
                // アフィン変換でWeb Mercator座標に変換
                const webMercatorX = trans.a * imageX + trans.b * imageY + trans.c;
                const webMercatorY = trans.d * imageX + trans.e * imageY + trans.f;
                
                // Web MercatorからGPS座標に変換
                const newLat = this.webMercatorYToLat(webMercatorY);
                const newLng = this.webMercatorXToLon(webMercatorX);
                
                this.logger.debug(`精密版変換結果: GPS(${newLat.toFixed(6)}, ${newLng.toFixed(6)})`);
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
            this.logger.info('=== ポイント位置同期処理開始 ===');
            
            if (!this.currentTransformation) {
                this.logger.warn('変換パラメータがないため同期をスキップ');
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
                
                const pointInfo = this.getPointInfoFromMarker(marker);
                if (!pointInfo) {
                    this.logger.warn(`マーカー${index}: ポイント情報を取得できません`);
                    return;
                }

                this.logger.debug(`マーカー${index}: 画像座標(${pointInfo.imageX}, ${pointInfo.imageY})`);

                // 現在の変換を使って新しい座標を計算
                const transformedGpsCoords = this.transformImageCoordsToGps(
                    pointInfo.imageX, 
                    pointInfo.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    const oldPos = marker.getLatLng();
                    this.logger.info(`マーカー${index}: ${pointInfo.name} 位置更新 [${oldPos.lat.toFixed(6)}, ${oldPos.lng.toFixed(6)}] → [${transformedGpsCoords[0].toFixed(6)}, ${transformedGpsCoords[1].toFixed(6)}]`);
                    
                    // マーカーの位置を更新
                    marker.setLatLng(transformedGpsCoords);
                    
                    // ポップアップ内容も更新
                    const updatedPopupContent = this.createUpdatedPopupContent(pointInfo, transformedGpsCoords);
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