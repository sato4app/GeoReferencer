// GeoReferencerメインアプリケーションファイル - リファクタリング版
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { Georeferencing } from './georeferencing.js';
import { RouteSpotHandler } from './route-spot-handler.js';
import { CoordinateDisplay } from './coordinate-display.js';
import { UIHandlers } from './ui-handlers.js';
import { CONFIG, EVENTS, DEFAULTS } from './constants.js';
import { Logger, errorHandler } from './utils.js';

class GeoReferencerApp {
    constructor() {
        this.logger = new Logger('GeoReferencerApp');
        this.mapCore = null;
        this.imageOverlay = null;
        this.gpsData = null;
        this.georeferencing = null;
        this.routeSpotHandler = null;
        this.coordinateDisplay = null;
        this.uiHandlers = null;
        this.pointJsonData = null;
        this.imageCoordinateMarkers = [];
        
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
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error(CONFIG.ERROR_MESSAGES.MAP_NOT_INITIALIZED);
            }

            // 各モジュールを初期化
            this.imageOverlay = new ImageOverlay(this.mapCore);
            this.gpsData = new GPSData();
            this.georeferencing = new Georeferencing(this.mapCore, this.imageOverlay, this.gpsData);
            this.routeSpotHandler = new RouteSpotHandler(this.mapCore, this.imageOverlay);
            this.coordinateDisplay = new CoordinateDisplay(this.mapCore, this.imageOverlay);
            this.uiHandlers = new UIHandlers();

            // CoordinateDisplayインスタンスをGeoreferencingに注入
            this.georeferencing.setCoordinateDisplay(this.coordinateDisplay);
            
            // RouteSpotHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setRouteSpotHandler(this.routeSpotHandler);

            this.logger.debug('全モジュール初期化完了');
            
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
                    if (routeSpotJsonInput) {
                        routeSpotJsonInput.click();
                    } else {
                        this.logger.warn('ファイル入力要素が見つかりません');
                    }
                });
            }
            
            if (routeSpotJsonInput) {
                routeSpotJsonInput.addEventListener('change', (event) => {
                    this.handleRouteSpotJsonLoad(event);
                });
            }

            // 読み込みJSONボタン
            const loadJsonBtn = document.getElementById('loadJsonBtn');
            const multiJsonInput = document.getElementById('multiJsonInput');
            
            if (loadJsonBtn) {
                loadJsonBtn.addEventListener('click', () => {
                    if (multiJsonInput) {
                        multiJsonInput.click();
                    } else {
                        this.logger.warn('複数JSONファイル入力要素が見つかりません');
                    }
                });
            }
            
            if (multiJsonInput) {
                multiJsonInput.addEventListener('change', (event) => {
                    this.handleMultiJsonLoad(event);
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
            
            // GPSDataクラスのExcel読み込み機能を使用
            const rawData = await this.gpsData.loadExcelFile(file);
            
            // Excel データを検証・変換
            const validatedData = this.uiHandlers.validateAndConvertExcelData(rawData);
            
            if (validatedData.length === 0) {
                throw new Error('有効なGPSポイントデータが見つかりませんでした。');
            }
            
            // GPSDataに変換されたデータを設定
            this.gpsData.setPointsFromExcelData(validatedData);
            
            // 地図上にGPSポイントを表示
            if (this.mapCore && this.mapCore.getMap()) {
                this.gpsData.displayPointsOnMap(this.mapCore.getMap());
            }
            
            // GPS ポイント数を更新
            this.uiHandlers.updateGpsPointCount(this.gpsData);
            
            this.logger.info(`GPS Excelファイル読み込み完了: ${validatedData.length}ポイント`);
            
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
            this.georeferencing.setPointJsonData(data);
            
            // imageX, imageYを持つポイントを画像上に表示
            if (this.imageOverlay && data) {
                // 既存のマーカーをクリア
                this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                
                this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'points', this.imageCoordinateMarkers);
                
                // GeoreferencingクラスにもmarkerInfoを渡す
                this.imageCoordinateMarkers.forEach(markerInfo => {
                    this.georeferencing.addImageCoordinateMarker(markerInfo);
                });
                
                this.logger.info(`ポイントマーカー登録完了: ${this.imageCoordinateMarkers.length}個`);
            }
            
            // ポイント座標数を更新
            this.uiHandlers.updatePointCoordCount(this.pointJsonData);
            
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

            // RouteSpotHandlerに処理を委譲（自動判定するため、selectedRouteSpotTypeは不要）
            await this.routeSpotHandler.handleRouteSpotJsonLoad(files, null);
            
            // ルート・スポット数を更新
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);
            
        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        }
    }

    async handleMultiJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            this.logger.info(`複数JSONファイル読み込み開始: ${files.length}ファイル`);
            
            let pointsProcessed = 0;
            let routesProcessed = 0;
            let spotsProcessed = 0;
            
            // 最初にポイントデータのマーカーをクリア（一度だけ）
            let shouldClearMarkers = true;
            
            // 各ファイルを処理
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    this.logger.info(`JSONファイル処理開始: ${file.name}`);
                    
                    // RouteSpotHandlerの自動判定を使用してファイル内容を判定
                    const detectedType = this.routeSpotHandler.detectJsonType(data);
                    
                    if (detectedType === 'route') {
                        // ルートデータの場合
                        await this.routeSpotHandler.handleRouteSpotJsonLoad([file], null);
                        routesProcessed++;
                        
                    } else if (detectedType === 'spot') {
                        // スポットデータの場合
                        await this.routeSpotHandler.handleRouteSpotJsonLoad([file], null);
                        if (data.spots && Array.isArray(data.spots)) {
                            spotsProcessed += data.spots.length;
                        } else {
                            spotsProcessed++;
                        }
                        
                    } else if (detectedType === 'point') {
                        // ポイントデータの場合
                        this.pointJsonData = data;
                        this.georeferencing.setPointJsonData(data);
                        
                        // 画像上にポイント座標を表示
                        if (this.imageOverlay && data.points) {
                            // 最初のポイントファイル処理時のみマーカーをクリア
                            if (shouldClearMarkers) {
                                this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                                this.imageCoordinateMarkers = []; // マーカー配列もクリア
                                shouldClearMarkers = false;
                            }
                            
                            this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'points', this.imageCoordinateMarkers);
                            
                            // GeoreferencingクラスにもmarkerInfoを渡す
                            this.imageCoordinateMarkers.forEach(markerInfo => {
                                this.georeferencing.addImageCoordinateMarker(markerInfo);
                            });
                            
                            this.logger.info(`ポイントマーカー登録完了: ${this.imageCoordinateMarkers.length}個`);
                        }
                        
                        pointsProcessed++;
                        
                    } else {
                        this.logger.warn(`未知のJSONファイル形式: ${file.name}`);
                    }
                    
                } catch (fileError) {
                    this.logger.error(`ファイル処理エラー: ${file.name}`, fileError);
                    // 個別ファイルのエラーは警告として処理し、他のファイルの処理を続行
                }
            }
            
            // UIを更新
            if (this.pointJsonData) {
                this.uiHandlers.updatePointCoordCount(this.pointJsonData);
            }
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);
            
            this.logger.info(`複数JSONファイル読み込み完了 - ポイント: ${pointsProcessed}, ルート: ${routesProcessed}, スポット: ${spotsProcessed}`);
            
        } catch (error) {
            this.logger.error('複数JSON読み込みエラー', error);
            errorHandler.handle(error, '複数JSONファイルの読み込みに失敗しました。', '複数JSON読み込み');
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
            
            // 3-10. Georeferencingクラスに処理を委譲
            await this.georeferencing.executeGeoreferencing();
            this.georeferencing.setupGeoreferencingUI();
            const result = await this.georeferencing.performGeoreferencingCalculations();
            
            // 結果を表示
            this.uiHandlers.updateMatchResults(result);
            
            this.logger.info('画像重ね合わせ処理完了', result);
            
        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, error.message, '画像重ね合わせ');
        }
    }

    async handleExportGeoJson() {
        try {
            this.logger.info('GeoJSON出力処理開始');
            
            // ジオリファレンス済みデータをGeoJSON形式で出力
            if (!this.georeferencing) {
                throw new Error('ジオリファレンス機能が初期化されていません。');
            }

            // ジオリファレンス済みデータを収集
            const geoJsonData = await this.collectGeoreferencedData();
            
            if (!geoJsonData.features || geoJsonData.features.length === 0) {
                throw new Error('出力対象のデータがありません。ジオリファレンスを実行してください。');
            }
            
            // ファイルとしてダウンロード
            this.uiHandlers.downloadGeoJson(geoJsonData);
            
            this.logger.info(`GeoJSON出力完了: ${geoJsonData.features.length}件`);
            
        } catch (error) {
            this.logger.error('GeoJSON出力エラー', error);
            errorHandler.handle(error, error.message, 'GeoJSON出力');
        }
    }
}

    
    async collectGeoreferencedData() {
        try {
            const features = [];
            
            // 1. ジオリファレンスで使用されたポイント（元のGPS値）を収集
            if (this.gpsData && this.georeferencing) {
                const matchResult = this.georeferencing.matchPointJsonWithGPS(this.gpsData.getPoints());
                
                for (const pair of matchResult.matchedPairs) {
                    features.push({
                        type: 'Feature',
                        properties: {
                            id: pair.pointJsonId,
                            name: pair.gpsPoint.pointId,
                            type: 'matched_point',
                            source: 'gps_original',
                            description: 'ジオリファレンス制御点（元GPS値）'
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [pair.gpsPoint.lng, pair.gpsPoint.lat, pair.gpsPoint.elevation || 0]
                        }
                    });
                }
            }
            
            // 2. ジオリファレンス変換されたルート中間点を収集
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    if (meta && meta.origin === 'image') {
                        const latLng = marker.getLatLng();
                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `route_${meta.routeId}_${meta.label}`,
                                name: meta.label || 'ルートポイント',
                                type: 'route_point',
                                source: 'image_transformed',
                                route_id: meta.routeId,
                                description: 'ジオリファレンス変換済みルートポイント'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: [latLng.lng, latLng.lat, 0]
                            }
                        });
                    }
                }
            }
            
            // 3. ジオリファレンス変換されたスポットを収集
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                for (const marker of this.routeSpotHandler.spotMarkers) {
                    const meta = marker.__meta;
                    if (meta && meta.origin === 'image') {
                        const latLng = marker.getLatLng();
                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `spot_${meta.spotId}`,
                                name: meta.spotId || 'スポット',
                                type: 'spot',
                                source: 'image_transformed',
                                description: 'ジオリファレンス変換済みスポット'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: [latLng.lng, latLng.lat, 0]
                            }
                        });
                    }
                }
            }
            
            return {
                type: 'FeatureCollection',
                features: features
            };
            
        } catch (error) {
            this.logger.error('ジオリファレンス済みデータ収集エラー', error);
            throw new Error('ジオリファレンス済みデータの収集に失敗しました。');
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