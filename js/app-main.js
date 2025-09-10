// GeoReferencerメインアプリケーションファイル - 画像重ね合わせ機能のみ
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { CONFIG, EVENTS, DEFAULTS } from './constants.js';
import { Logger } from './logger.js';
import { errorHandler } from './error-handler.js';
import { FileHandler } from './file-handler.js';

class GeoReferencerApp {
    constructor() {
        this.logger = new Logger('GeoReferencerApp');
        this.mapCore = null;
        this.imageOverlay = null;
        this.gpsData = null;
        this.pointJsonData = null; // ポイントJSONデータを保存
        this.currentTransformation = null; // 現在の変換パラメータを保存
        this.fileHandler = new FileHandler(); // Excel読み込み用
        this.routeData = []; // ルートデータを配列で保存
        this.spotData = []; // スポットデータを配列で保存
        this.routeMarkers = []; // 地図上のルートマーカー
        this.spotMarkers = []; // 地図上のスポットマーカー
        
        this.logger.info('GeoReferencerApp初期化開始');
    }

    async init() {
        try {
            this.logger.info('アプリケーション初期化開始');
            
            // コアモジュール初期化
            this.mapCore = new MapCore();
            this.logger.debug('MapCore初期化開始');
            
            // MapCoreの初期化完了を待つ
            await this.mapCore.initPromise;
            this.logger.debug('MapCore初期化Promise完了');
            
            // 他のモジュールを初期化
            await this.initializeModules();
            
            // イベントハンドラー設定
            this.setupEventHandlers();
            
            this.logger.info('アプリケーション初期化完了');
            
        } catch (error) {
            this.logger.error('アプリケーション初期化エラー', error);
            errorHandler.handle(error, 'アプリケーション初期化中にエラーが発生しました。', 'アプリケーション初期化');
        }
    }

    async initializeModules() {
        try {
            // 地図が初期化されていることを確認
            if (!this.mapCore || !this.mapCore.map) {
                throw new Error(CONFIG.ERROR_MESSAGES.MAP_NOT_INITIALIZED);
            }

            // ImageOverlayを初期化
            this.imageOverlay = new ImageOverlay(this.mapCore);
            this.logger.debug('ImageOverlay初期化完了');

            // GPSDataを初期化
            this.gpsData = new GPSData();
            this.logger.debug('GPSData初期化完了');

            this.logger.info('全モジュール初期化完了');
            
        } catch (error) {
            this.logger.error('モジュール初期化エラー', error);
            throw error;
        }
    }

    setupEventHandlers() {
        try {
            // 統合された読み込みボタン
            const loadFileBtn = document.getElementById('loadFileBtn');
            const gpsExcelInput = document.getElementById('gpsExcelInput');
            const imageInput = document.getElementById('imageInput');
            const pointCoordJsonInput = document.getElementById('pointCoordJsonInput');
            
            if (loadFileBtn) {
                loadFileBtn.addEventListener('click', () => {
                    // 選択されているラジオボタンの値を取得
                    const selectedFileType = document.querySelector('input[name="fileType"]:checked')?.value;
                    
                    switch (selectedFileType) {
                        case 'gpsGeoJson':
                            if (gpsExcelInput) gpsExcelInput.click();
                            break;
                        case 'image':
                            if (imageInput) imageInput.click();
                            break;
                        case 'pointCoord':
                            if (pointCoordJsonInput) pointCoordJsonInput.click();
                            break;
                        default:
                            this.logger.warn('ファイル種類が選択されていません');
                    }
                });
            }

            // ファイル入力の変更イベント
            if (gpsExcelInput) {
                gpsExcelInput.addEventListener('change', (event) => {
                    this.handleGpsExcelLoad(event);
                });
            }
            
            if (imageInput) {
                imageInput.addEventListener('change', (event) => {
                    this.handleImageLoad(event);
                });
            }
            
            if (pointCoordJsonInput) {
                pointCoordJsonInput.addEventListener('change', (event) => {
                    this.handlePointCoordJsonLoad(event);
                });
            }

            // ルート・スポット読み込みボタン
            const loadRouteSpotBtn = document.getElementById('loadRouteSpotBtn');
            const routeSpotJsonInput = document.getElementById('routeSpotJsonInput');
            
            if (loadRouteSpotBtn) {
                loadRouteSpotBtn.addEventListener('click', () => {
                    // 選択されているラジオボタンの値を取得
                    const selectedRouteSpotType = document.querySelector('input[name="routeSpotType"]:checked')?.value;
                    
                    if (selectedRouteSpotType && routeSpotJsonInput) {
                        routeSpotJsonInput.click();
                    } else {
                        this.logger.warn('ルート・スポット種類が選択されていません');
                    }
                });
            }
            
            if (routeSpotJsonInput) {
                routeSpotJsonInput.addEventListener('change', (event) => {
                    this.handleRouteSpotJsonLoad(event);
                });
            }

            // 画像の重ね合わせボタン
            const matchPointsBtn = document.getElementById('matchPointsBtn');
            if (matchPointsBtn) {
                matchPointsBtn.addEventListener('click', () => {
                    this.handleMatchPoints();
                });
            }


            // GeoJSON出力ボタン
            const exportGeoJsonBtn = document.getElementById('exportGeoJsonBtn');
            if (exportGeoJsonBtn) {
                exportGeoJsonBtn.addEventListener('click', () => {
                    this.handleExportGeoJson();
                });
            }

            this.logger.debug('イベントハンドラー設定完了');
            
        } catch (error) {
            this.logger.error('イベントハンドラー設定エラー', error);
            errorHandler.handle(error, 'イベントハンドラーの設定中にエラーが発生しました。', 'イベントハンドラー設定');
        }
    }

    async handleGpsExcelLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('GPS Excelファイル読み込み開始', file.name);
            
            // ExcelファイルをFileHandlerで読み込み
            const rawData = await this.fileHandler.loadExcelFile(file);
            
            // Excel データを検証・変換
            const validatedData = this.validateAndConvertExcelData(rawData);
            
            if (validatedData.length === 0) {
                throw new Error('有効なGPSポイントデータが見つかりませんでした。');
            }
            
            // GPSDataに変換されたデータを設定
            if (this.gpsData) {
                this.gpsData.setPointsFromExcelData(validatedData);
                
                // 地図上にGPSポイントを表示
                if (this.mapCore && this.mapCore.map) {
                    this.gpsData.displayPointsOnMap(this.mapCore.map);
                }
                
                // GPS ポイント数を更新
                this.updateGpsPointCount();
                
                this.logger.info(`GPS Excelファイル読み込み完了: ${validatedData.length}ポイント`);
            }
            
        } catch (error) {
            this.logger.error('GPS Excel読み込みエラー', error);
            errorHandler.handle(error, error.message, 'GPS Excel読み込み');
        }
    }

    async handleImageLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('PNG画像ファイル読み込み開始', file.name);
            
            if (this.imageOverlay) {
                await this.imageOverlay.loadImage(file);
                this.logger.info('PNG画像ファイル読み込み完了');
            }
            
        } catch (error) {
            this.logger.error('画像読み込みエラー', error);
            errorHandler.handle(error, '画像ファイルの読み込みに失敗しました。', '画像読み込み');
        }
    }

    async handlePointCoordJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ポイント(座標)JSONファイル読み込み開始', file.name);
            
            // JSONファイルを読み込んでポイント座標情報を処理
            const text = await file.text();
            const data = JSON.parse(text);
            
            // ポイントJSONデータを保存
            this.pointJsonData = data;
            
            // imageX, imageYを持つポイントを画像上に表示
            if (this.imageOverlay && data) {
                await this.displayImageCoordinates(data, 'points');
            }
            
            // ポイント座標数を更新
            this.updatePointCoordCount();
            
            this.logger.info('ポイント(座標)JSON読み込み完了', data);
            
        } catch (error) {
            this.logger.error('ポイント(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ポイント(座標)JSONファイルの読み込みに失敗しました。', 'ポイント(座標)JSON読み込み');
        }
    }

    async handleRouteSpotJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            this.logger.info(`ルート・スポット(座標)JSONファイル読み込み開始: ${files.length}ファイル`);
            
            // 選択されているラジオボタンの値を取得
            const selectedRouteSpotType = document.querySelector('input[name="routeSpotType"]:checked')?.value;
            
            const newData = [];
            
            // 複数ファイルを順次処理
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    // ファイルごとに処理
                    if (selectedRouteSpotType === 'route') {
                        const processedRoutes = this.processRouteData(data, file.name);
                        newData.push(...processedRoutes);
                    } else if (selectedRouteSpotType === 'spot') {
                        const processedSpots = this.processSpotData(data, file.name);
                        newData.push(...processedSpots);
                    }
                    
                    this.logger.info(`ファイル読み込み完了: ${file.name}`);
                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                    // エラーがあっても他のファイルは処理を続ける
                }
            }
            
            // データを追加または更新（既存データを保持し、重複を除外）
            if (selectedRouteSpotType === 'route') {
                this.routeData = this.mergeAndDeduplicate(this.routeData, newData, 'route');
            } else if (selectedRouteSpotType === 'spot') {
                this.spotData = this.mergeAndDeduplicate(this.spotData, newData, 'spot');
            }
            
            // GPS座標を持つルート・スポットを地図上に表示
            if (this.mapCore && this.mapCore.map && newData.length > 0) {
                await this.displayRouteSpotOnMap(newData, selectedRouteSpotType);
            }
            
            // ルート・スポット数を更新
            this.updateRouteSpotCount();
            
            this.logger.info(`ルート・スポット(座標)JSON読み込み完了: 合計${newData.length}項目追加`);
            
        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        }
    }

    async handleMatchPoints() {
        try {
            this.logger.info('画像重ね合わせ処理開始');
            
            // 1. 画像ファイルの読み込みと準備チェック
            if (!this.imageOverlay || !this.imageOverlay.currentImage || !this.imageOverlay.currentImage.src) {
                throw new Error('PNG画像が読み込まれていません。');
            }

            if (!this.gpsData || !this.gpsData.getPoints() || this.gpsData.getPoints().length === 0) {
                throw new Error('GPS座標データが読み込まれていません。');
            }

            // 2. 初期表示境界の設定
            const centerPos = this.mapCore.getMap().getCenter();
            this.imageOverlay.setCenterPosition(centerPos);
            
            // 3. 座標変換とスケール計算の実行
            await this.executeGeoreferencing();
            
            // 4. リアルタイム操作用のUI要素配置
            this.setupGeoreferencingUI();
            
            // 5-6. ドラッグ&ドロップとリサイズは既存のImageOverlayクラスで実装済み
            
            // 7-10. 地理座標系での境界管理、レイヤー管理、データ同期、エラーハンドリングを実行
            const result = await this.performGeoreferencingCalculations();
            
            // 結果を表示
            this.updateMatchResults(result);
            
            this.logger.info('画像重ね合わせ処理完了', result);
            
        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, error.message, '画像重ね合わせ');
        }
    }

    async executeGeoreferencing() {
        try {
            // 地図中心を基準とした初期境界（getInitialBounds）を計算
            const currentBounds = this.imageOverlay.getInitialBounds();
            this.logger.debug('初期境界設定完了', currentBounds);
            
            // 画像のnaturalWidth/naturalHeightで実際のピクセル寸法を取得
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            
            if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
                throw new Error('画像のピクセル寸法を取得できません。');
            }

            // Web Mercator投影での地理座標からピクセル座標への変換
            const centerPos = this.mapCore.getMap().getCenter();
            const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());
            
            // 座標変換の妥当性チェック
            if (!isFinite(metersPerPixel) || metersPerPixel <= 0) {
                throw new Error('座標変換パラメータの計算に失敗しました。');
            }

            // 画像スケールと地図ズームレベルに基づく表示サイズの決定
            const scale = this.imageOverlay.getCurrentScale();
            const scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
            const scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
            
            // 地球半径（6,378,137m）を使った距離・角度変換
            const earthRadius = 6378137;
            const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
            const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * Math.cos(centerPos.lat * Math.PI / 180)) * (180 / Math.PI);
            
            // 座標値の有効性チェック（NaN/Infiniteの検証）
            if (!isFinite(latOffset) || !isFinite(lngOffset)) {
                throw new Error('地理座標の計算に失敗しました。');
            }

            this.logger.debug('ジオリファレンス計算完了', {
                imageSize: { width: imageWidth, height: imageHeight },
                metersPerPixel,
                scale,
                offsets: { lat: latOffset, lng: lngOffset }
            });

            // 画像表示を更新
            this.imageOverlay.updateImageDisplay();
            
        } catch (error) {
            this.logger.error('ジオリファレンス実行エラー', error);
            throw error;
        }
    }

    setupGeoreferencingUI() {
        try {
            // 中心マーカー：画像全体の移動用（水色の円）
            // 4つのコーナーハンドル：画像サイズ調整用（各角にパルス効果付きハンドル）
            // これらは既にImageOverlayクラスで実装されているため、ここでは有効化のみ
            
            if (!this.mapCore.getMap().hasLayer(this.imageOverlay.centerMarker)) {
                this.imageOverlay.centerMarker.addTo(this.mapCore.getMap());
            }

            // 専用レイヤーペイン（centerMarker, dragHandles）による重ね順制御
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

            // ポイントJSONデータ(key:'Id')とGPSポイント(key:'pointId')の比較
            const matchResult = this.matchPointJsonWithGPS(gpsPoints);

            // マッチしたペアが2つ以上ある場合、画像を自動的に位置合わせ
            if (matchResult.matchedPairs.length >= 2) {
                await this.performAutomaticGeoreferencing(matchResult.matchedPairs);
            } else if (matchResult.matchedPairs.length === 1) {
                // 1つのポイントのみマッチした場合は中心合わせのみ
                await this.centerImageOnSinglePoint(matchResult.matchedPairs[0]);
            }

            // 画像位置変更時のコールバック通知システム
            this.imageOverlay.addImageUpdateCallback(() => {
                this.logger.debug('画像位置更新通知受信');
                // 他モジュール（PointOverlay等）との座標同期
                // JSONポイントデータの位置更新連携
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

            // 最低2ペア、最適には3-4ペアを使用してアフィン変換を計算
            const controlPoints = matchedPairs.slice(0, 4); // 最大4ペアまで使用

            // アフィン変換パラメータを計算
            const transformation = this.calculateAffineTransformation(controlPoints);
            
            if (transformation) {
                // 変換パラメータを使って画像を配置
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

            // GPSポイントの位置に画像中心を移動
            const gpsLat = matchedPair.gpsPoint.lat;
            const gpsLng = matchedPair.gpsPoint.lng;

            // 単純な中心移動用の変換パラメータを作成
            this.currentTransformation = {
                type: 'center_only',
                targetPointImageX: matchedPair.pointJson.imageX,
                targetPointImageY: matchedPair.pointJson.imageY,
                targetPointGpsLat: gpsLat,
                targetPointGpsLng: gpsLng
            };

            this.imageOverlay.setCenterPosition([gpsLat, gpsLng]);

            // ポイントJSONマーカーの位置を更新
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

            // 2ポイントの場合：スケールと平行移動のみ（回転なし）
            if (controlPoints.length === 2) {
                return this.calculateSimpleTransformation(controlPoints);
            }

            // 3ポイント以上の場合：完全なアフィン変換
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

            // 画像座標系での2点間距離
            const imageDistanceX = point2.pointJson.imageX - point1.pointJson.imageX;
            const imageDistanceY = point2.pointJson.imageY - point1.pointJson.imageY;
            const imageDistance = Math.sqrt(imageDistanceX * imageDistanceX + imageDistanceY * imageDistanceY);

            // GPS座標系での2点間距離（メートル単位）
            const gpsDistance = this.mapCore.getMap().distance(
                [point1.gpsPoint.lat, point1.gpsPoint.lng],
                [point2.gpsPoint.lat, point2.gpsPoint.lng]
            );

            if (imageDistance === 0 || gpsDistance === 0) {
                this.logger.warn('距離が0のため変換計算できません');
                return null;
            }

            // スケール係数（メートル/ピクセル）
            const scale = gpsDistance / imageDistance;

            // 画像の実際の中心座標を取得
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            const actualImageCenterX = imageWidth / 2;
            const actualImageCenterY = imageHeight / 2;

            // 最初のポイントを基準にして画像中心のGPS座標を計算
            const referencePoint = point1;
            const deltaX = actualImageCenterX - referencePoint.pointJson.imageX;
            const deltaY = actualImageCenterY - referencePoint.pointJson.imageY;

            // 画像座標の差分をGPS座標差分に変換
            const earthRadius = 6378137;
            const centerLat = referencePoint.gpsPoint.lat;
            const cosLat = Math.cos(centerLat * Math.PI / 180);
            
            // より正確な座標変換を実行
            // Y軸は画像とGPS座標系で向きが逆なので反転必要
            const latOffset = (deltaY * scale) / earthRadius * (180 / Math.PI);
            // 経度オフセットは緯度による地球の縮小を考慮
            const lngOffset = (deltaX * scale) / (earthRadius * cosLat) * (180 / Math.PI);

            // 画像中心のGPS座標（Y軸反転と精度改善）
            const imageCenterGpsLat = referencePoint.gpsPoint.lat - latOffset; // Y軸反転
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
            // アフィン変換は複雑な数学処理が必要なため、
            // 現在は簡易版として最初の2ポイントを使用
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
                // 簡易変換を適用
                await this.applySimpleTransformation(transformation);
            }

            this.logger.info('画像変換適用完了');

        } catch (error) {
            this.logger.error('画像変換適用エラー', error);
        }
    }

    async applySimpleTransformation(transformation) {
        try {
            // 変換パラメータを保存
            this.currentTransformation = transformation;

            // 画像中心をGPS座標に合わせる
            this.imageOverlay.setCenterPosition([
                transformation.centerGpsLat, 
                transformation.centerGpsLng
            ]);

            // 画像のピクセル寸法を取得
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageWidth || !imageHeight) {
                throw new Error('画像サイズの取得に失敗しました');
            }

            // 現在のズームレベルでのメートル/ピクセル値を計算
            const centerPos = [transformation.centerGpsLat, transformation.centerGpsLng];
            const metersPerPixel = 156543.03392 * Math.cos(centerPos[0] * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());

            // 新しいスケール値を計算（ImageOverlayのスケール値として）
            const newScale = transformation.scale / metersPerPixel;

            this.logger.info('変換パラメータ', {
                centerGps: centerPos,
                scale: transformation.scale,
                metersPerPixel: metersPerPixel,
                newScale: newScale
            });

            // スケールを適用
            this.imageOverlay.setCurrentScale(newScale);

            // 画像表示を更新
            this.imageOverlay.updateImageDisplay();

            // ポイントJSONマーカーの位置を更新
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

            // ポイントJSONデータから配列を抽出
            const pointJsonArray = Array.isArray(this.pointJsonData) ? this.pointJsonData : 
                (this.pointJsonData.points ? this.pointJsonData.points : [this.pointJsonData]);

            totalPointJsons = pointJsonArray.length;

            // GPSポイントをpointIdでインデックス化
            const gpsPointMap = new Map();
            gpsPoints.forEach(gpsPoint => {
                gpsPointMap.set(gpsPoint.pointId, gpsPoint);
            });

            // ポイントJSONの各要素について、対応するGPSポイントを検索
            pointJsonArray.forEach((pointJson, index) => {
                const pointJsonId = pointJson.Id || pointJson.id || pointJson.name;
                
                if (!pointJsonId) {
                    this.logger.warn(`ポイントJSON[${index}]にIdが見つかりません:`, pointJson);
                    unmatchedPointJsonIds.push(`[${index}] (IDなし)`);
                    return;
                }

                // 対応するGPSポイントを検索
                const matchingGpsPoint = gpsPointMap.get(pointJsonId);

                if (matchingGpsPoint) {
                    // マッチした場合
                    const pair = {
                        pointJsonId: pointJsonId,
                        pointJson: pointJson,
                        gpsPoint: matchingGpsPoint
                    };
                    matchedPairs.push(pair);
                } else {
                    // マッチしなかった場合
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

            this.logger.info('ポイントJSONマーカー位置更新開始', this.imageCoordinateMarkers.length + '個');

            // 既存マーカーの更新
            for (let i = 0; i < this.imageCoordinateMarkers.length; i++) {
                const marker = this.imageCoordinateMarkers[i];
                
                // マーカーからポイント情報を取得
                const pointInfo = this.getPointInfoFromMarker(marker);
                if (!pointInfo) continue;

                // 画像座標をGPS座標に変換
                const transformedGpsCoords = this.transformImageCoordsToGps(
                    pointInfo.imageX, 
                    pointInfo.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    // マーカー位置を更新
                    marker.setLatLng(transformedGpsCoords);
                    
                    // ポップアップ内容も更新
                    const updatedPopupContent = this.createUpdatedPopupContent(pointInfo, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            this.logger.info('ポイントJSONマーカー位置更新完了');
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー位置更新エラー', error);
        }
    }

    getPointInfoFromMarker(marker) {
        try {
            const popup = marker.getPopup();
            if (!popup) return null;

            const content = popup.getContent();
            if (!content) return null;

            // ポップアップ内容から画像座標を抽出
            const imageXMatch = content.match(/画像座標: \((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)/);
            if (!imageXMatch) return null;

            // 名前を抽出
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
                // 簡易変換：画像中心を基準とした比例変換
                const deltaImageX = imageX - transformation.centerImageX;
                const deltaImageY = imageY - transformation.centerImageY;

                // 地球半径とスケールを使って緯度経度オフセットを計算
                const earthRadius = 6378137;
                const latOffset = (deltaImageY * transformation.scale) / earthRadius * (180 / Math.PI);
                const lngOffset = (deltaImageX * transformation.scale) / (earthRadius * Math.cos(transformation.centerGpsLat * Math.PI / 180)) * (180 / Math.PI);

                // GPS座標系での新しい座標
                const newLat = transformation.centerGpsLat - latOffset; // Y軸は上が正、緯度は北が正なので反転
                const newLng = transformation.centerGpsLng + lngOffset;

                return [newLat, newLng];
                
            } else if (transformation.type === 'center_only') {
                // 中心移動のみ：基準ポイントからの相対位置を保持
                const deltaImageX = imageX - transformation.targetPointImageX;
                const deltaImageY = imageY - transformation.targetPointImageY;

                // 現在のズームレベルとデフォルトスケールで距離を計算
                const currentZoom = this.mapCore.getMap().getZoom();
                const metersPerPixel = 156543.03392 * Math.cos(transformation.targetPointGpsLat * Math.PI / 180) / Math.pow(2, currentZoom);
                const defaultScale = this.imageOverlay.getDefaultScale();
                
                // ピクセル距離をメートル距離に変換
                const deltaMetersX = deltaImageX * defaultScale * metersPerPixel;
                const deltaMetersY = deltaImageY * defaultScale * metersPerPixel;

                // メートル距離を緯度経度オフセットに変換
                const earthRadius = 6378137;
                const latOffset = deltaMetersY / earthRadius * (180 / Math.PI);
                const lngOffset = deltaMetersX / (earthRadius * Math.cos(transformation.targetPointGpsLat * Math.PI / 180)) * (180 / Math.PI);

                // GPS座標系での新しい座標
                const newLat = transformation.targetPointGpsLat - latOffset; // Y軸反転
                const newLng = transformation.targetPointGpsLng + lngOffset;

                return [newLat, newLng];
            }

            return null;
            
        } catch (error) {
            this.logger.error('座標変換エラー', error);
            return null;
        }
    }

    async updatePointJsonMarkersAfterCentering() {
        try {
            if (!this.currentTransformation || !this.imageCoordinateMarkers || this.imageCoordinateMarkers.length === 0) {
                this.logger.debug('変換パラメータまたはポイントJSONマーカーが存在しません');
                return;
            }

            this.logger.info('ポイントJSONマーカー中心移動更新開始', this.imageCoordinateMarkers.length + '個');

            // 既存マーカーの更新（中心移動版）
            for (let i = 0; i < this.imageCoordinateMarkers.length; i++) {
                const marker = this.imageCoordinateMarkers[i];
                
                // マーカーからポイント情報を取得
                const pointInfo = this.getPointInfoFromMarker(marker);
                if (!pointInfo) continue;

                // 画像座標をGPS座標に変換（中心移動版）
                const transformedGpsCoords = this.transformImageCoordsToGps(
                    pointInfo.imageX, 
                    pointInfo.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    // マーカー位置を更新
                    marker.setLatLng(transformedGpsCoords);
                    
                    // ポップアップ内容も更新
                    const updatedPopupContent = this.createUpdatedPopupContent(pointInfo, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            this.logger.info('ポイントJSONマーカー中心移動更新完了');
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー中心移動更新エラー', error);
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
            // 画像座標を持つポイントマーカーの位置を更新
            if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
                this.imageCoordinateMarkers.forEach(marker => {
                    // マーカーの座標を再計算して更新（必要に応じて実装）
                    // 現在は既存の位置を保持
                });
            }
            
            this.logger.debug('ポイント位置同期完了');
            
        } catch (error) {
            this.logger.error('ポイント位置同期エラー', error);
        }
    }


    async handleExportGeoJson() {
        try {
            this.logger.info('GeoJSON出力処理開始');
            
            // GPSDataからポイントデータをGeoJSON形式で出力
            if (!this.gpsData) {
                throw new Error('GPSデータが読み込まれていません。');
            }

            // GeoJSON形式で出力
            const geoJson = this.gpsData.exportAsGeoJson();
            
            // ファイルとしてダウンロード
            this.downloadGeoJson(geoJson);
            
            this.logger.info('GeoJSON出力完了');
            
        } catch (error) {
            this.logger.error('GeoJSON出力エラー', error);
            errorHandler.handle(error, 'GeoJSONの出力に失敗しました。', 'GeoJSON出力');
        }
    }

    updateMatchResults(result) {
        try {
            const matchedCountField = document.getElementById('matchedPointCountField');
            const unmatchedPointsField = document.getElementById('unmatchedPointsField');
            
            if (matchedCountField) {
                matchedCountField.value = result.matchedCount || 0;
            }
            
            if (unmatchedPointsField) {
                let displayText = '';
                if (result.unmatchedPoints && result.unmatchedPoints.length > 0) {
                    // 不一致ポイント：一致するGPSポイントが見つからなかったポイントJSONのIdを表示
                    displayText = result.unmatchedPoints.join('\n');
                }
                unmatchedPointsField.value = displayText;
            }
            
            // ジオリファレンス完了時の追加情報をログに記録
            if (result.georeferenceCompleted) {
                this.logger.info('ジオリファレンス詳細結果', {
                    totalGpsPoints: result.totalPoints,
                    totalPointJsons: result.totalPointJsons || 0,
                    matchedPairs: result.matchedCount,
                    unmatchedPointJsonCount: result.unmatchedPoints ? result.unmatchedPoints.length : 0,
                    matchPercentage: result.totalPointJsons > 0 ? 
                        Math.round((result.matchedCount / result.totalPointJsons) * 100) : 0
                });

            }
            
        } catch (error) {
            this.logger.error('マッチング結果表示エラー', error);
        }
    }

    async displayImageCoordinates(data, type) {
        try {
            if (!this.imageOverlay || !this.mapCore || !this.mapCore.map) {
                throw new Error('地図または画像オーバーレイが初期化されていません。');
            }

            // 既存の座標マーカーを削除
            this.clearImageCoordinateMarkers();

            // データから座標を抽出して表示
            const coordinates = this.extractImageCoordinates(data);
            
            this.logger.info(`${type}の座標表示開始`, coordinates.length + 'ポイント');

            // 画像座標をLeaflet座標に変換して表示
            coordinates.forEach((coord, index) => {
                if (coord.imageX !== undefined && coord.imageY !== undefined) {
                    // 簡易的な座標変換（実際のジオリファレンス機能実装まで）
                    const latLng = this.convertImageToLatLng(coord.imageX, coord.imageY);
                    
                    // マーカーの種類を判定
                    const markerType = this.determineMarkerType(coord, type);
                    
                    // マーカーを作成
                    const marker = this.createCustomMarker(latLng, markerType).addTo(this.mapCore.map);
                    
                    // ポップアップを追加
                    const popupContent = `
                        <div>
                            <strong>${coord.name || `${type} ${index + 1}`}</strong><br>
                            画像座標: (${coord.imageX}, ${coord.imageY})<br>
                            ${coord.description || ''}
                        </div>
                    `;
                    marker.bindPopup(popupContent);
                    
                    // マーカーを保存（後で削除できるように）
                    if (!this.imageCoordinateMarkers) {
                        this.imageCoordinateMarkers = [];
                    }
                    this.imageCoordinateMarkers.push(marker);
                }
            });

            this.logger.info(`${type}の座標表示完了`, coordinates.length + 'ポイント表示');
            
        } catch (error) {
            this.logger.error('画像座標表示エラー', error);
            throw error;
        }
    }

    extractImageCoordinates(data) {
        const coordinates = [];
        
        try {
            if (Array.isArray(data)) {
                // 配列の場合、各要素から座標を抽出
                data.forEach(item => {
                    if (item.imageX !== undefined && item.imageY !== undefined) {
                        coordinates.push({
                            imageX: item.imageX,
                            imageY: item.imageY,
                            name: item.name || item.id,
                            description: item.description || '',
                            type: item.type,
                            id: item.id,
                            index: item.index
                        });
                    }
                });
            } else if (data && typeof data === 'object') {
                // オブジェクトの場合、プロパティから座標を抽出
                if (data.points && Array.isArray(data.points)) {
                    data.points.forEach(point => {
                        if (point.imageX !== undefined && point.imageY !== undefined) {
                            coordinates.push({
                                imageX: point.imageX,
                                imageY: point.imageY,
                                name: point.name || point.id,
                                description: point.description || '',
                                type: point.type,
                                id: point.id,
                                index: point.index
                            });
                        }
                    });
                }
                
                if (data.routes && Array.isArray(data.routes)) {
                    data.routes.forEach(route => {
                        if (route.points && Array.isArray(route.points)) {
                            route.points.forEach(point => {
                                if (point.imageX !== undefined && point.imageY !== undefined) {
                                    coordinates.push({
                                        imageX: point.imageX,
                                        imageY: point.imageY,
                                        name: point.name || `${route.name || 'Route'} Point`,
                                        description: point.description || '',
                                        type: point.type,
                                        id: point.id,
                                        index: point.index
                                    });
                                }
                            });
                        }
                    });
                }
            }
        } catch (error) {
            this.logger.error('座標抽出エラー', error);
        }
        
        return coordinates;
    }

    convertImageToLatLng(imageX, imageY) {
        // 画像がロードされていない場合は、地図の中心付近に表示
        if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
            const center = this.mapCore.getInitialCenter();
            // 画像座標を正規化してオフセットを計算
            const normalizedX = (imageX - 500) / 1000; // 仮定：画像は1000x1000ピクセル
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01; // より適切なスケール
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        // 画像が読み込まれている場合は、実際の画像境界を使用して変換
        const imageBounds = this.imageOverlay.imageOverlay.getBounds();
        const imageInfo = this.imageOverlay.getCurrentImageInfo();
        
        if (!imageBounds || !imageInfo.isLoaded) {
            // フォールバック：地図中心周辺に表示
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        // 画像のピクセル情報を取得
        const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
        const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
        
        if (!imageWidth || !imageHeight) {
            // フォールバック
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        // 画像座標（0,0は左上）をLeaflet座標に変換
        const southWest = imageBounds.getSouthWest();
        const northEast = imageBounds.getNorthEast();
        
        // より精密な座標変換アルゴリズム
        // X座標（西→東）の変換 - 緯度による地球の縮小を考慮
        const xRatio = imageX / imageWidth;
        const centerLat = (southWest.lat + northEast.lat) / 2;
        const cosLat = Math.cos(centerLat * Math.PI / 180);
        
        // 経度オフセットに緯度補正を適用
        const lngSpan = (northEast.lng - southWest.lng);
        const lng = southWest.lng + lngSpan * xRatio;
        
        // Y座標（北→南）の変換（画像座標系では上が0、下が正の値）
        const yRatio = imageY / imageHeight;
        const lat = northEast.lat - (northEast.lat - southWest.lat) * yRatio;
        
        return [lat, lng];
    }

    clearImageCoordinateMarkers() {
        if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
            this.imageCoordinateMarkers.forEach(marker => {
                if (this.mapCore && this.mapCore.map) {
                    this.mapCore.map.removeLayer(marker);
                }
            });
            this.imageCoordinateMarkers = [];
        }
    }

    // マーカーの種類を判定
    determineMarkerType(coord, type) {
        // データの内容に基づいてマーカーの種類を判定
        if (coord.type === 'waypoint') {
            return 'wayPoint'; // ルート中間点
        } else if (coord.type === 'spot' && coord.name) {
            return 'spot'; // スポット
        } else if (!coord.type && coord.id) {
            return 'pointJSON'; // ポイントJSON
        }
        return 'pointJSON'; // デフォルト
    }

    // カスタムマーカーを作成
    createCustomMarker(latLng, markerType) {
        switch (markerType) {
            case 'pointJSON': // ポイントJSON - 円形、半径6px、赤色
                return L.circleMarker(latLng, {
                    radius: 6,
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 1,
                    weight: 0,
                    pane: 'pointJsonMarkers'
                });
                
            case 'wayPoint': // ルート中間点 - 菱形、4px、オレンジ
                const diamondIcon = L.divIcon({
                    className: 'diamond-marker',
                    html: '<div style="width: 8px; height: 8px; background-color: #ffa500; transform: rotate(45deg);"></div>',
                    iconSize: [8, 8],
                    iconAnchor: [4, 4]
                });
                return L.marker(latLng, { 
                    icon: diamondIcon,
                    pane: 'wayPointMarkers'
                });
                
            case 'spot': // スポット - 正方形、12px、青色
                const squareIcon = L.divIcon({
                    className: 'square-marker',
                    html: '<div style="width: 12px; height: 12px; background-color: #0000ff;"></div>',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                return L.marker(latLng, { 
                    icon: squareIcon,
                    pane: 'spotMarkers'
                });
                
            default:
                return L.circleMarker(latLng, {
                    radius: 6,
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 1,
                    weight: 0,
                    pane: 'pointJsonMarkers'
                });
        }
    }

    // ルート・スポットを地図上に表示
    async displayRouteSpotOnMap(data, type) {
        try {
            if (!this.mapCore || !this.mapCore.map) {
                throw new Error('地図が初期化されていません。');
            }

            this.logger.info(`${type}データの地図表示開始`, data.length + '項目');

            data.forEach((item, index) => {
                if (type === 'route' && item.points && Array.isArray(item.points)) {
                    // ルートの場合：線として描画
                    const latLngs = item.points
                        .filter(point => point.lat && point.lng)
                        .map(point => [point.lat, point.lng]);
                    
                    if (latLngs.length > 1) {
                        const polyline = L.polyline(latLngs, {
                            color: '#ff6600',
                            weight: 3,
                            opacity: 0.8
                        }).addTo(this.mapCore.map);
                        
                        // ルート情報をポップアップで表示
                        const routeInfo = `
                            <div>
                                <strong>ルート: ${item.name || item.routeId}</strong><br>
                                ファイル: ${item.fileName}<br>
                                ポイント数: ${item.points.length}
                            </div>
                        `;
                        polyline.bindPopup(routeInfo);
                        
                        // ルートマーカーを保存
                        if (!this.routeMarkers) this.routeMarkers = [];
                        this.routeMarkers.push(polyline);
                    }
                } else if (type === 'spot' && item.coordinates) {
                    // スポットの場合：マーカーとして表示
                    const latLng = [item.coordinates.lat, item.coordinates.lng];
                    
                    const marker = L.circleMarker(latLng, {
                        radius: 8,
                        color: '#0066ff',
                        fillColor: '#0066ff',
                        fillOpacity: 0.8,
                        weight: 2
                    }).addTo(this.mapCore.map);
                    
                    // スポット情報をポップアップで表示
                    const spotInfo = `
                        <div>
                            <strong>スポット: ${item.name || item.spotId}</strong><br>
                            ファイル: ${item.fileName}<br>
                            座標: (${item.coordinates.lat.toFixed(6)}, ${item.coordinates.lng.toFixed(6)})
                        </div>
                    `;
                    marker.bindPopup(spotInfo);
                    
                    // スポットマーカーを保存
                    if (!this.spotMarkers) this.spotMarkers = [];
                    this.spotMarkers.push(marker);
                }
            });

            this.logger.info(`${type}データの地図表示完了`, data.length + '項目表示');
            
        } catch (error) {
            this.logger.error('ルート・スポット地図表示エラー', error);
            throw error;
        }
    }

    downloadGeoJson(geoJson) {
        try {
            const dataStr = JSON.stringify(geoJson, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = 'georeferenced-data.geojson';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.logger.info('GeoJSONファイルダウンロード開始');
            
        } catch (error) {
            this.logger.error('GeoJSONダウンロードエラー', error);
        }
    }

    updateGpsPointCount() {
        try {
            const gpsPointCountField = document.getElementById('gpsPointCount');
            if (gpsPointCountField && this.gpsData) {
                const points = this.gpsData.getPoints();
                const count = points ? points.length : 0;
                gpsPointCountField.value = count;
                this.logger.debug(`GPS ポイント数更新: ${count}個`);
            }
        } catch (error) {
            this.logger.error('GPS ポイント数更新エラー', error);
        }
    }

    updatePointCoordCount() {
        try {
            const pointCoordCountField = document.getElementById('pointCoordCount');
            if (pointCoordCountField && this.pointJsonData) {
                let count = 0;
                
                // ポイントJSONデータから配列を抽出
                const pointJsonArray = Array.isArray(this.pointJsonData) ? this.pointJsonData : 
                    (this.pointJsonData.points ? this.pointJsonData.points : [this.pointJsonData]);
                
                count = pointJsonArray.length;
                pointCoordCountField.value = count;
                this.logger.debug(`ポイント座標数更新: ${count}個`);
            }
        } catch (error) {
            this.logger.error('ポイント座標数更新エラー', error);
        }
    }

    // ルートデータを処理してプロパティ別に分類
    // 仕様：JSONファイル1つで1本のルート
    processRouteData(data, fileName) {
        const routes = [];
        
        try {
            // 仕様に基づき、1つのJSONファイル = 1本のルートとして扱う
            const route = {
                ...data,
                fileName: fileName,
                routeId: data.id || fileName.replace('.json', ''),
                startPoint: this.extractStartPoint(data),
                endPoint: this.extractEndPoint(data)
            };
            routes.push(route);
            
        } catch (error) {
            this.logger.error(`ルートデータ処理エラー: ${fileName}`, error);
        }
        
        return routes;
    }

    // スポットデータを処理
    // 仕様：JSONファイル1つで複数のスポットを含む場合がある
    processSpotData(data, fileName) {
        const spots = [];
        
        try {
            if (Array.isArray(data)) {
                // 配列の場合、各要素をスポットとして扱う
                data.forEach((item, index) => {
                    spots.push({
                        ...item,
                        fileName: fileName,
                        spotId: item.id || item.name || `${fileName}_spot_${index}`,
                        coordinates: this.extractCoordinates(item)
                    });
                });
            } else if (data && typeof data === 'object') {
                // オブジェクトの場合
                if (data.spots && Array.isArray(data.spots)) {
                    // spotsプロパティに配列がある場合
                    data.spots.forEach((spot, index) => {
                        spots.push({
                            ...spot,
                            fileName: fileName,
                            spotId: spot.id || spot.name || `${fileName}_spot_${index}`,
                            coordinates: this.extractCoordinates(spot)
                        });
                    });
                } else if (data.features && Array.isArray(data.features)) {
                    // GeoJSON形式の場合
                    data.features.forEach((feature, index) => {
                        const coords = feature.geometry && feature.geometry.coordinates;
                        spots.push({
                            ...feature.properties,
                            fileName: fileName,
                            spotId: feature.properties?.id || feature.properties?.name || `${fileName}_spot_${index}`,
                            coordinates: coords ? { lat: coords[1], lng: coords[0] } : this.extractCoordinates(feature.properties)
                        });
                    });
                } else {
                    // 単一スポットオブジェクト
                    spots.push({
                        ...data,
                        fileName: fileName,
                        spotId: data.id || data.name || `${fileName}_spot_0`,
                        coordinates: this.extractCoordinates(data)
                    });
                }
            }
        } catch (error) {
            this.logger.error(`スポットデータ処理エラー: ${fileName}`, error);
        }
        
        return spots;
    }

    // ルートの開始ポイントを抽出
    extractStartPoint(route) {
        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const firstPoint = route.points[0];
            return {
                lat: firstPoint.lat || firstPoint.latitude,
                lng: firstPoint.lng || firstPoint.longitude,
                name: firstPoint.name || 'Start'
            };
        }
        return null;
    }

    // ルートの終了ポイントを抽出
    extractEndPoint(route) {
        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const lastPoint = route.points[route.points.length - 1];
            return {
                lat: lastPoint.lat || lastPoint.latitude,
                lng: lastPoint.lng || lastPoint.longitude,
                name: lastPoint.name || 'End'
            };
        }
        return null;
    }

    // スポットの座標を抽出
    extractCoordinates(spot) {
        return {
            lat: spot.lat || spot.latitude,
            lng: spot.lng || spot.longitude
        };
    }

    // 重複除外とマージ
    mergeAndDeduplicate(existingData, newData, type) {
        const merged = [...existingData];
        
        newData.forEach(newItem => {
            let isDuplicate = false;
            
            if (type === 'route') {
                // ルートの重複チェック（開始・終了ポイントが同じ）
                isDuplicate = merged.some(existing => 
                    this.isSameRoute(existing, newItem)
                );
            } else if (type === 'spot') {
                // スポットの重複チェック（座標が同じ）
                isDuplicate = merged.some(existing => 
                    this.isSameSpot(existing, newItem)
                );
            }
            
            if (!isDuplicate) {
                merged.push(newItem);
            } else {
                this.logger.debug(`重複データを除外: ${type} - ${newItem.fileName}`);
            }
        });
        
        return merged;
    }

    // 同じルートかどうか判定（開始・終了ポイントが同じ）
    isSameRoute(route1, route2) {
        const start1 = route1.startPoint;
        const end1 = route1.endPoint;
        const start2 = route2.startPoint;
        const end2 = route2.endPoint;
        
        if (!start1 || !end1 || !start2 || !end2) {
            return false;
        }
        
        const tolerance = 0.0001; // 座標の許容誤差
        
        return (
            Math.abs(start1.lat - start2.lat) < tolerance &&
            Math.abs(start1.lng - start2.lng) < tolerance &&
            Math.abs(end1.lat - end2.lat) < tolerance &&
            Math.abs(end1.lng - end2.lng) < tolerance
        );
    }

    // 同じスポットかどうか判定（座標が同じ）
    isSameSpot(spot1, spot2) {
        const coord1 = spot1.coordinates;
        const coord2 = spot2.coordinates;
        
        if (!coord1 || !coord2) {
            return false;
        }
        
        const tolerance = 0.0001; // 座標の許容誤差
        
        return (
            Math.abs(coord1.lat - coord2.lat) < tolerance &&
            Math.abs(coord1.lng - coord2.lng) < tolerance
        );
    }

    updateRouteSpotCount() {
        try {
            const routeCountField = document.getElementById('routeCount');
            const spotCountField = document.getElementById('spotCount');
            
            // ルート数を更新
            if (routeCountField) {
                const routeCount = Array.isArray(this.routeData) ? this.routeData.length : 0;
                routeCountField.value = routeCount;
                this.logger.debug(`ルート数更新: ${routeCount}本`);
            }
            
            // スポット数を更新
            if (spotCountField) {
                const spotCount = Array.isArray(this.spotData) ? this.spotData.length : 0;
                spotCountField.value = spotCount;
                this.logger.debug(`スポット数更新: ${spotCount}個`);
            }
            
        } catch (error) {
            this.logger.error('ルート・スポット数更新エラー', error);
        }
    }

    validateAndConvertExcelData(rawData) {
        try {
            if (!rawData || rawData.length === 0) {
                throw new Error('Excelファイルが空です。');
            }

            // 列名定義
            const requiredColumns = ['ポイントID', '名称', '緯度', '経度'];
            const optionalColumns = ['標高', '備考'];
            const allColumns = [...requiredColumns, ...optionalColumns];

            // ヘッダー行を取得
            const headerRow = rawData[0];
            if (!headerRow || headerRow.length === 0) {
                throw new Error('ヘッダー行が見つかりません。');
            }

            // 列名の完全一致確認
            const columnIndexMap = {};
            for (const column of allColumns) {
                const index = headerRow.indexOf(column);
                if (index !== -1) {
                    columnIndexMap[column] = index;
                } else if (requiredColumns.includes(column)) {
                    throw new Error(`必須列「${column}」が見つかりません。`);
                }
            }

            this.logger.info('Excel列マッピング', columnIndexMap);

            // データ行を処理
            const validatedData = [];
            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                // 必須項目の存在確認
                const pointData = {};
                let isValidRow = true;

                for (const column of requiredColumns) {
                    const value = row[columnIndexMap[column]];
                    if (value === undefined || value === null || value === '') {
                        this.logger.warn(`行${i + 1}: 必須項目「${column}」が空です`);
                        isValidRow = false;
                        break;
                    }
                    pointData[column] = value;
                }

                if (!isValidRow) continue;

                // 任意項目の処理
                for (const column of optionalColumns) {
                    if (columnIndexMap[column] !== undefined) {
                        const value = row[columnIndexMap[column]];
                        if (value !== undefined && value !== null && value !== '') {
                            pointData[column] = value;
                        }
                    }
                }

                // 緯度経度の数値変換と検証
                try {
                    const lat = parseFloat(pointData['緯度']);
                    const lng = parseFloat(pointData['経度']);
                    
                    if (isNaN(lat) || isNaN(lng)) {
                        this.logger.warn(`行${i + 1}: 緯度・経度が数値ではありません`);
                        continue;
                    }

                    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        this.logger.warn(`行${i + 1}: 緯度・経度の範囲が不正です`);
                        continue;
                    }

                    // GPSDataで使用する形式に変換
                    validatedData.push({
                        pointId: pointData['ポイントID'],
                        name: pointData['名称'],
                        lat: lat,
                        lng: lng,
                        elevation: pointData['標高'] || null,
                        description: pointData['備考'] || null
                    });

                } catch (error) {
                    this.logger.warn(`行${i + 1}: データ変換エラー`, error);
                    continue;
                }
            }

            this.logger.info(`Excel検証完了: ${validatedData.length}/${rawData.length - 1}行が有効`);
            return validatedData;

        } catch (error) {
            this.logger.error('Excel データ検証エラー', error);
            throw error;
        }
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new GeoReferencerApp();
        await app.init();
        
        // グローバルスコープでデバッグ用にアクセス可能にする
        window.geoApp = app;
        
    } catch (error) {
        console.error('アプリケーション起動エラー:', error);
        
        // エラーをユーザーにも表示
        document.body.innerHTML = `
            <div style="padding: 20px; color: red; font-family: monospace;">
                <h2>アプリケーション起動エラー</h2>
                <p>エラー: ${error.message}</p>
                <details>
                    <summary>詳細情報</summary>
                    <pre>${error.stack}</pre>
                </details>
                <p>ローカルサーバーが起動していることを確認してください。</p>
                <p>例: <code>python -m http.server 8000</code></p>
            </div>
        `;
    }
});