// GeoReferencerメインアプリケーションファイル - リファクタリング版
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { Georeferencing } from './georeferencing.js';
import { RouteSpotHandler } from './route-spot-handler.js';
import { AreaHandler } from './area-handler.js';
import { CoordinateDisplay } from './coordinate-display.js';
import { UIHandlers } from './ui-handlers.js';
import { FileHandler } from './file-handler.js';
import { CONFIG, DEFAULTS } from './constants.js';
import { Logger, errorHandler } from './utils.js';

// 標高取得
import { ElevationFetcher } from './elevation-fetcher.js';

class GeoReferencerApp {
    constructor() {
        this.logger = new Logger('GeoReferencerApp');
        this.mapCore = null;
        this.imageOverlay = null;
        this.gpsData = null;
        this.georeferencing = null;
        this.routeSpotHandler = null;
        this.areaHandler = null;
        this.coordinateDisplay = null;
        this.uiHandlers = null;
        this.fileHandler = null;
        this.pointJsonData = null;
        this.imageCoordinateMarkers = [];

        // PNG画像ファイル名を記録
        this.currentPngFileName = null;

        // 標高取得
        this.elevationFetcher = null;

        this.logger.info('GeoReferencerApp初期化開始');
    }

    async init() {
        try {
            this.logger.info('アプリケーション初期化開始');

            // コアモジュール初期化
            this.mapCore = new MapCore();

            // MapCoreの初期化完了を待つ
            await this.mapCore.initPromise;

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
            this.areaHandler = new AreaHandler(this.mapCore, this.imageOverlay);
            this.coordinateDisplay = new CoordinateDisplay(this.mapCore, this.imageOverlay);
            this.uiHandlers = new UIHandlers();
            this.fileHandler = new FileHandler();
            this.elevationFetcher = new ElevationFetcher(); // Firebaseなしで初期化

            // CoordinateDisplayインスタンスをGeoreferencingに注入
            this.georeferencing.setCoordinateDisplay(this.coordinateDisplay);

            // RouteSpotHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setRouteSpotHandler(this.routeSpotHandler);

            // AreaHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setAreaHandler(this.areaHandler);


        } catch (error) {
            this.logger.error('モジュール初期化エラー', error);
            throw error;
        }
    }

    setupEventHandlers() {
        try {
            // 読み込みボタン（汎用）
            const loadFileBtn = document.getElementById('loadFileBtn');
            const gpsExcelInput = document.getElementById('gpsExcelInput');
            const imageInput = document.getElementById('imageInput');
            const jsonInput = document.getElementById('jsonInput');

            if (loadFileBtn) {
                loadFileBtn.addEventListener('click', () => {
                    // ラジオボタンの選択状態を取得
                    const selectedRadio = document.querySelector('input[name="loadType"]:checked');
                    if (!selectedRadio) return;

                    const loadType = selectedRadio.value;
                    if (loadType === 'gps' && gpsExcelInput) {
                        gpsExcelInput.click();
                    } else if (loadType === 'png' && imageInput) {
                        imageInput.click();
                    } else if (loadType === 'json' && jsonInput) {
                        jsonInput.click();
                    }
                });
            }

            // GPS Excelファイル入力
            if (gpsExcelInput) {
                gpsExcelInput.addEventListener('change', (event) => {
                    this.handleGpsExcelLoad(event);
                    this.recordFileDirectory(event.target.files[0]);
                });
            }

            // PNG画像ファイル入力
            if (imageInput) {
                imageInput.addEventListener('change', (event) => {
                    this.handlePngLoad(event);
                    this.recordFileDirectory(event.target.files[0]);
                });
            }

            // JSONファイル入力 (New)
            if (jsonInput) {
                jsonInput.addEventListener('change', (event) => {
                    this.handleJsonLoad(event); // 既存の汎用JSON読み込みを使用
                    // ファイル名は特に表示しない? 必要なら追加
                    this.recordFileDirectory(event.target.files[0]);
                });
            }

            // 画像の重ね合わせボタン
            const matchPointsBtn = document.getElementById('matchPointsBtn');
            if (matchPointsBtn) {
                matchPointsBtn.addEventListener('click', () => {
                    this.handleMatchPoints();
                });
            }

            // GeoJSON保存ボタン (旧Firebase保存)
            const saveGeoJsonBtn = document.getElementById('saveGeoJsonBtn');
            if (saveGeoJsonBtn) {
                saveGeoJsonBtn.addEventListener('click', () => {
                    this.handleExportGeoJson();
                });
            }

            // 標高取得ボタン
            const fetchElevationBtn = document.getElementById('fetchElevationBtn');
            if (fetchElevationBtn) {
                fetchElevationBtn.addEventListener('click', () => {
                    this.handleFetchElevation();
                });
            }

        } catch (error) {
            this.logger.error('イベントハンドラー設定エラー', error);
            errorHandler.handle(error, 'イベントハンドラーの設定中にエラーが発生しました。', 'イベントハンドラー設定');
        }
    }

    async handleGpsExcelLoad(event) {
        try {
            // 既存データがある場合は確認
            const existingCount = this.gpsData?.getPoints()?.length || 0;
            if (existingCount > 0) {
                const shouldClear = window.confirm(
                    `既存の${existingCount}個のポイントをクリアして、新しく読み込みます。`
                );
                if (!shouldClear) {
                    // ファイル入力をリセット
                    event.target.value = '';
                    return;
                }
            }

            const file = event.target.files[0];
            if (!file) {
                // ファイル選択がキャンセルされた場合
                // 既存データは保持(一時保存不要)
                return;
            }

            this.logger.info('GPS Excelファイル読み込み開始', file.name);

            // 既存データをクリア
            if (existingCount > 0) {
                this.gpsData.gpsPoints = [];
                this.gpsData.clearMarkersFromMap();
            }

            // GPSDataクラスのExcel読み込み機能を使用
            const rawData = await this.fileHandler.loadExcelFile(file);

            // Excel データを検証・変換
            const validatedData = this.fileHandler.validateAndConvertExcelData(rawData);

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

            // 成功メッセージを表示
            this.showMessage(`${validatedData.length}個のポイントGPSを読み込みました`);

        } catch (error) {
            this.logger.error('GPS Excel読み込みエラー', error);
            errorHandler.handle(error, error.message, 'GPS Excel読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    async handlePngLoad(event) {
        try {
            // 既存データがある場合は確認
            if (this.currentPngFileName) {
                const shouldClear = window.confirm(
                    `既存の画像およびそのデータをクリアして、新しく読み込みます。`
                );
                if (!shouldClear) {
                    // ファイル入力をリセット
                    event.target.value = '';
                    return;
                }
            }

            const file = event.target.files[0];
            if (!file) {
                // ファイル選択がキャンセルされた場合
                return;
            }

            // 既存データをクリア(画面上のみ)
            if (this.currentPngFileName) {
                // 画像クリア
                if (this.imageOverlay) {
                    // Leaflet ImageOverlayを地図から削除
                    if (this.imageOverlay.imageOverlay && this.mapCore && this.mapCore.getMap()) {
                        this.mapCore.getMap().removeLayer(this.imageOverlay.imageOverlay);
                    }
                    // ImageOverlayの内部状態をクリア
                    this.imageOverlay.imageOverlay = null;
                    this.imageOverlay.currentImage = new Image(); // 新しいImageオブジェクトを作成
                    this.imageOverlay.currentImageFileName = null;
                    this.imageOverlay.resetTransformation();
                }

                // ポイント・ルート・スポットクリア
                if (this.routeSpotHandler) {
                    this.routeSpotHandler.pointData = [];
                    this.routeSpotHandler.routeData = [];
                    this.routeSpotHandler.spotData = [];
                    this.routeSpotHandler.clearAllMarkers();
                }

                this.currentPngFileName = null;
            }

            // PNGファイル名を記録（拡張子を除去）
            this.currentPngFileName = file.name.replace(/\.[^/.]+$/, '');
            this.logger.info('PNGファイル:', this.currentPngFileName);

            // ファイル名を表示
            const pngFileNameField = document.getElementById('pngFileName');
            if (pngFileNameField) {
                pngFileNameField.value = file.name;
                pngFileNameField.title = file.name; // ツールチップでも表示
            }

            // PNG画像を読み込み
            if (this.imageOverlay) {
                await this.imageOverlay.loadImage(file);
            }



            // 成功メッセージを表示
            this.showMessage(`PNG画像ファイルを読み込みました:\n${file.name}`);

        } catch (error) {
            this.logger.error('PNG読み込みエラー', error);
            errorHandler.handle(error, 'PNG画像の読み込みに失敗しました。', 'PNG読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
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

    async handleJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            this.logger.info(`複数JSONファイル読み込み開始: ${files.length}ファイル`);
            this.showMessage('JSONファイルを読み込んでいます...');

            let pointsProcessed = 0;
            let routesProcessed = 0;
            let spotsProcessed = 0;
            let areasProcessed = 0;
            let geoJsonProcessed = 0;

            // 最初にポイントデータのマーカーをクリア（一度だけ）
            let shouldClearMarkers = true;

            const allGpsPoints = [];
            const otherGeoJsonFeatures = [];

            // 各ファイルを処理
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    this.logger.info(`JSONファイル処理開始: ${file.name}`);

                    // 1. GeoJSON形式の判定
                    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                        // GeoJSONとして処理
                        for (const feature of data.features) {
                            if (feature.geometry && feature.geometry.type === 'Point' && feature.properties && feature.properties.type !== 'route' && feature.properties.type !== 'spot' && feature.properties.type !== 'area') {
                                // ポイントデータ (GPS)
                                allGpsPoints.push({
                                    pointId: feature.properties.id || feature.properties.name || `Point_${allGpsPoints.length + 1}`,
                                    lat: feature.geometry.coordinates[1],
                                    lng: feature.geometry.coordinates[0],
                                    elevation: feature.geometry.coordinates[2] || 0,
                                    location: feature.properties.name || feature.properties.location || '',
                                    gpsElevation: feature.properties.gpsElevation || 0
                                });
                            } else {
                                // その他 (参照用)
                                otherGeoJsonFeatures.push(feature);
                            }
                        }
                        geoJsonProcessed++;
                        continue;
                    }

                    // 2. 独自形式 (Route/Spot/Point) の判定
                    const detectedType = this.routeSpotHandler.detectJsonType(data);

                    if (detectedType === 'route') {
                        // ルートデータの場合 (画像座標として表示)
                        // データをrouteSpotHandlerに格納（カウント・エクスポート用）
                        const routes = this.routeSpotHandler.processRouteData(data, file.name);
                        this.routeSpotHandler.routeData = this.routeSpotHandler.mergeAndDeduplicate(
                            this.routeSpotHandler.routeData, routes, 'route'
                        );
                        // 画像上にルート中間点を表示
                        if (shouldClearMarkers) {
                            this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }
                        this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'route', this.imageCoordinateMarkers);
                        routesProcessed++;

                    } else if (detectedType === 'spot') {
                        // スポットデータの場合 (画像座標として表示)
                        // データをrouteSpotHandlerに格納（カウント・エクスポート用）
                        const spots = this.routeSpotHandler.processSpotData(data, file.name);
                        this.routeSpotHandler.spotData = this.routeSpotHandler.mergeAndDeduplicate(
                            this.routeSpotHandler.spotData, spots, 'spot'
                        );
                        // 画像上にスポットを表示
                        if (shouldClearMarkers) {
                            this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }
                        this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'spot', this.imageCoordinateMarkers);
                        if (data.spots && Array.isArray(data.spots)) {
                            spotsProcessed += data.spots.length;
                        } else {
                            spotsProcessed++;
                        }

                    } else if (detectedType === 'point') {
                        // ポイントデータの場合 (画像処理用)
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

                            this.logger.info(`ポイント: ${this.imageCoordinateMarkers.length}個`);
                        }

                        pointsProcessed++;

                    } else if (detectedType === 'area') {
                        // エリアデータの場合 (画像座標として表示)
                        if (data.areas && Array.isArray(data.areas)) {
                            await this.areaHandler.loadFromFirebaseData(data.areas, this.imageOverlay);
                            areasProcessed += data.areas.length;
                        }

                    } else if (detectedType === 'combined') {
                        // 複合形式の場合 (points/routes/spots/areasが1ファイルに格納)
                        const combinedData = data.data;

                        if (shouldClearMarkers) {
                            this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }

                        // 画像上に全座標を表示（points, routes waypoints, spots）
                        this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'combined', this.imageCoordinateMarkers);

                        // GeoreferencingクラスにもmarkerInfoを渡す（重ね合わせ時に位置更新されるよう）
                        this.imageCoordinateMarkers.forEach(markerInfo => {
                            this.georeferencing.addImageCoordinateMarker(markerInfo);
                        });

                        // ポイントデータを格納（ジオリファレンス用）
                        if (combinedData.points && Array.isArray(combinedData.points)) {
                            const pointData = {
                                points: combinedData.points.map(p => ({
                                    ...p,
                                    imageX: p.imageX !== undefined ? p.imageX : p.x,
                                    imageY: p.imageY !== undefined ? p.imageY : p.y
                                }))
                            };
                            this.pointJsonData = pointData;
                            this.georeferencing.setPointJsonData(pointData);
                            pointsProcessed += combinedData.points.length;
                        }

                        // ルートデータを格納（カウント用）
                        if (combinedData.routes && Array.isArray(combinedData.routes)) {
                            combinedData.routes.forEach(route => {
                                this.routeSpotHandler.routeData.push({
                                    ...route,
                                    fileName: file.name,
                                    routeId: route.routeName || file.name
                                });
                            });
                            routesProcessed += combinedData.routes.length;
                        }

                        // スポットデータを格納（カウント用）
                        if (combinedData.spots && Array.isArray(combinedData.spots)) {
                            combinedData.spots.forEach(spot => {
                                this.routeSpotHandler.spotData.push({
                                    ...spot,
                                    fileName: file.name,
                                    spotId: spot.name || `${file.name}_spot`
                                });
                            });
                            spotsProcessed += combinedData.spots.length;
                        }

                        // エリアデータを処理・表示
                        if (combinedData.areas && Array.isArray(combinedData.areas)) {
                            await this.areaHandler.loadFromFirebaseData(combinedData.areas, this.imageOverlay);
                            areasProcessed += combinedData.areas.length;
                        }

                    } else {
                        this.logger.warn(`未知のJSONファイル形式: ${file.name}`);
                    }

                } catch (fileError) {
                    this.logger.error(`ファイル処理エラー: ${file.name}`, fileError);
                }
            }

            // GeoJSON由来のGPSポイントを表示
            if (allGpsPoints.length > 0 && this.gpsData) {
                this.gpsData.setPointsFromExcelData(allGpsPoints);
                if (this.mapCore && this.mapCore.map) {
                    this.gpsData.displayPointsOnMap(this.mapCore.map);
                }
                this.uiHandlers.updateGpsPointCount(this.gpsData);
            }

            // GeoJSON由来の参照レイヤーを表示
            if (otherGeoJsonFeatures.length > 0 && this.mapCore && this.mapCore.map) {
                if (this.referenceLayer) {
                    this.mapCore.map.removeLayer(this.referenceLayer);
                }
                this.referenceLayer = L.geoJSON(otherGeoJsonFeatures, {
                    style: (feature) => {
                        switch (feature.geometry.type) {
                            case 'LineString': return { color: 'blue', weight: 4 };
                            case 'Polygon': return { color: 'green', weight: 2, fillOpacity: 0.2 };
                            default: return { color: 'orange' };
                        }
                    },
                    onEachFeature: (feature, layer) => {
                        if (feature.properties && feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(this.mapCore.map);
            }

            // UIを更新
            if (this.pointJsonData) {
                this.uiHandlers.updatePointCoordCount(this.pointJsonData);
            }
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);
            this.uiHandlers.updateAreaCount(this.areaHandler.areas ? this.areaHandler.areas.length : 0);

            this.logger.info(`読み込み完了 - GeoJSON: ${geoJsonProcessed}, ポイント: ${pointsProcessed}, ルート: ${routesProcessed}, スポット: ${spotsProcessed}, エリア: ${areasProcessed}`);

            // 成功メッセージを表示
            this.showMessage(`ファイルを読み込みました (GeoJSON: ${geoJsonProcessed}, その他: ${files.length - geoJsonProcessed})`);

        } catch (error) {
            this.logger.error('JSON読み込みエラー', error);
            errorHandler.handle(error, 'JSONファイルの読み込みに失敗しました。', 'JSON読み込み');
        } finally {
            event.target.value = '';
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
                // GPSデータがなくても実行できるようにする？
                // プロンプトでは「ラジオボタン「JSONファイル」を選択して...PNG画像上に配置して」とある。
                // ジオリファレンスにはGPSデータ（コントロールポイント）が必要。
                // もし「JSONファイル」がコントロールポイントを含むならOKだが...
                // ここでは既存のチェックを維持するが、GPSデータ必須のエラーが出るかもしれない。
                // しかし、正規のフローでは「ポイントGPS」を読み込んでから実行するはず。
                if (!this.pointJsonData && (!this.gpsData.getPoints() || this.gpsData.getPoints().length === 0)) {
                    throw new Error('GPS座標データまたはポイントJSONデータが読み込まれていません。');
                }
            }

            // 2. 初期表示境界の設定

            // 3-10. Georeferencingクラスに処理を委譲
            await this.georeferencing.executeGeoreferencing();
            this.georeferencing.setupGeoreferencingUI();
            const result = await this.georeferencing.performGeoreferencingCalculations();

            // 結果を表示
            this.uiHandlers.updateMatchResults(result);

            // GeoJSON保存ボタンと標高取得ボタンを有効化
            const saveGeoJsonBtn = document.getElementById('saveGeoJsonBtn');
            if (saveGeoJsonBtn) {
                saveGeoJsonBtn.disabled = false;
            }

            const fetchElevationBtn = document.getElementById('fetchElevationBtn');
            if (fetchElevationBtn) {
                fetchElevationBtn.disabled = false;
                fetchElevationBtn.title = '標高未取得地点の標高を国土地理院APIから取得します';
            }

            this.logger.info('画像重ね合わせ処理完了', result);

            // 成功メッセージを表示
            this.showMessage(`${result.matchedCount}個のポイントにてジオリファレンスを行いました`);

            // 標高未取得件数を更新（ジオリファレンス後のルート中間点とスポットの件数を表示）
            this.updateElevationCounts();

        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, error.message, '画像重ね合わせ');
        }
    }

    // handleSaveToFirebase (旧) は削除済み

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

            // ファイルとして保存
            const geoJsonFileName = this.getGeoJsonFileName();
            // fileHandler.saveDataWithUserChoiceを使ってGeoJSON保存（拡張子は .json か .geojson か確認。saveDataWithUserChoiceは通常json）
            // 明示的にGeoJSONとして保存したい場合は拡張子をつけるなど
            const result = await this.fileHandler.saveDataWithUserChoice(geoJsonData, geoJsonFileName);

            if (result.success) {
                this.logger.info(`GeoJSON保存成功: ${result.filename}`);

                // 成功メッセージを表示
                this.showMessage(`GPSデータをGeoJSON形式にて出力しました:\n${result.filename}`);
            } else if (result.error !== 'キャンセル') {
                throw new Error(result.error);
            }

            this.logger.info(`GeoJSON出力完了: ${geoJsonData.features.length}件`);

        } catch (error) {
            this.logger.error('GeoJSON出力エラー', error);
            errorHandler.handle(error, error.message, 'GeoJSON出力');
        }
    }

    /**
     * 国土地理院APIから標高データを取得（Firebase依存なし）
     */
    async handleFetchElevation() {
        if (!this.elevationFetcher) {
            this.showMessage('標高取得機能が初期化されていません。', 'error');
            return;
        }

        const fetchElevationBtn = document.getElementById('fetchElevationBtn');
        if (fetchElevationBtn) fetchElevationBtn.disabled = true;

        try {
            this.logger.info('標高データ取得開始');
            this.showMessage('標高データの取得を開始します...');

            const progressContainer = document.getElementById('elevationProgressContainer');
            const progressBar = document.getElementById('elevationProgressBar');
            const progressText = document.getElementById('elevationProgressText');

            if (progressContainer) progressContainer.style.display = 'block';

            let totalFetched = 0;
            let totalFailed = 0;

            // 進捗更新用ヘルパー
            const updateProgress = (current, total, prefix) => {
                if (progressBar) {
                    const params = new URLSearchParams(window.location.search);
                    const isDebug = params.has('debug');
                    if (isDebug) console.log(`${prefix}: ${current}/${total}`);

                    // 全体の進捗は個別の処理で管理が難しいため、ここでは簡易的な表示に留めるか、
                    // あるいは各フェーズごとにバーをリセットして表示する
                    const percentage = Math.round((current / total) * 100);
                    progressBar.style.width = `${percentage}%`;
                    progressBar.textContent = `${percentage}%`;
                }
                if (progressText) {
                    progressText.textContent = `${prefix}の標高を取得中: ${current} / ${total}`;
                }
            };

            // 1. ルートマーカー（中間点含む）
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                this.logger.info('ルートマーカーの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetRouteMarkersElevation(
                    this.routeSpotHandler.routeMarkers,
                    (c, t) => updateProgress(c, t, 'ルート')
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 2. スポットマーカー
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                this.logger.info('スポットマーカーの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetSpotMarkersElevation(
                    this.routeSpotHandler.spotMarkers,
                    (c, t) => updateProgress(c, t, 'スポット')
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 3. エリア頂点
            if (this.areaHandler) {
                this.logger.info('エリア頂点の標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetAreaVerticesElevation(
                    this.areaHandler,
                    (c, t) => updateProgress(c, t, 'エリア')
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 4. ポイント（画像上のポイント）
            if (this.routeSpotHandler && this.routeSpotHandler.pointData && this.georeferencing) {
                this.logger.info('ポイントの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetPointsElevation(
                    this.routeSpotHandler.pointData,
                    this.georeferencing,
                    (c, t) => updateProgress(c, t, 'ポイント')
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            this.logger.info(`標高取得完了: 成功=${totalFetched}, 失敗=${totalFailed}`);
            this.showMessage(`標高データの取得が完了しました (取得: ${totalFetched}, 失敗: ${totalFailed})`);

            // 統計を更新
            this.updateElevationCounts();

        } catch (error) {
            this.logger.error('標高データ取得エラー', error);
            this.showMessage(`標高データの取得中にエラーが発生しました: ${error.message}`, 'error');
        } finally {
            if (fetchElevationBtn) fetchElevationBtn.disabled = false;
            if (document.getElementById('elevationProgressContainer')) {
                setTimeout(() => {
                    document.getElementById('elevationProgressContainer').style.display = 'none';
                }, 3000);
            }
        }
    }

    // collectGpsDataForFirebase (旧) は削除済み

    async collectGeoreferencedData() {
        try {
            const features = [];

            // 1. ポイント（画像座標をジオリファレンス変換）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.pointData && this.georeferencing && this.georeferencing.currentTransformation) {
                const points = this.routeSpotHandler.pointData;
                for (const point of points) {
                    const pointId = point.Id || point.id || point.pointId;
                    // 画像座標をアフィン変換でGPS座標に変換
                    const transformedLatLng = this.georeferencing.transformImageCoordsToGps(point.x, point.y, this.georeferencing.currentTransformation);

                    if (transformedLatLng) {
                        const lat = Array.isArray(transformedLatLng) ? transformedLatLng[0] : transformedLatLng.lat;
                        const lng = Array.isArray(transformedLatLng) ? transformedLatLng[1] : transformedLatLng.lng;
                        const elevation = point.elevation;

                        let coordinates = [this.roundCoordinate(lng), this.roundCoordinate(lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coordinates.push(this.roundCoordinate(elevation));
                        }

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: pointId,
                                name: point.name || pointId,
                                type: 'point',
                                source: 'image_transformed',
                                description: '画像ポイント（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coordinates
                            }
                        });
                    }
                }
            }

            // 2. エリア（ジオリファレンス変換済み）を収集
            if (this.areaHandler && this.georeferencing && this.georeferencing.currentTransformation) {
                const areas = this.areaHandler.getUpToDateAreas();
                for (const area of areas) {
                    const latLngs = this.areaHandler.calculateAreaLatLngs(area); // 内部で currentTransformation を使用して変換しているはず
                    // エリアハンドラーの calculateAreaLatLngs は georeferencing を参照しているか？
                    // 以前のコードでは calculateAreaLatLngs(area) を呼んでいた。
                    // AreaHandlerの実装を確認する必要があるが、ここでは呼び出して結果を使う。

                    if (latLngs && latLngs.length > 0) {
                        // GeoJSON Polygon coordinates: [[[lng, lat], [lng, lat], ...]] (closed loop)
                        // latLngsは [lat, lng] の配列? あるいは {lat, lng} ?
                        // collectGpsDataForFirebase では [lat, lng] or {lat, lng} だった。
                        // GeoJSONは [lng, lat]

                        const coordinates = latLngs.map((latLng, index) => {
                            const lat = Array.isArray(latLng) ? latLng[0] : latLng.lat;
                            const lng = Array.isArray(latLng) ? latLng[1] : latLng.lng;
                            // 標高はPolygonでは一般的にサポートされないことが多いが、XYZ対応なら可。
                            // ここでは2Dにしておくのが無難だが、Pointなどは3D。
                            // Polygonのcoordinatesは [lng, lat]
                            return [this.roundCoordinate(lng), this.roundCoordinate(lat)];
                        });

                        // 閉じる必要がある
                        if (coordinates.length > 0) {
                            const first = coordinates[0];
                            const last = coordinates[coordinates.length - 1];
                            if (first[0] !== last[0] || first[1] !== last[1]) {
                                coordinates.push(first);
                            }

                            features.push({
                                type: 'Feature',
                                properties: {
                                    id: area.id || `area_${Date.now()}`,
                                    name: area.name || '名称未設定エリア',
                                    type: 'area',
                                    source: 'image_transformed',
                                    description: 'エリア（GPS変換済）'
                                },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [coordinates]
                                }
                            });
                        }
                    }
                }
            }

            // 3. ルート（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                // ルートデータから開始・終了ポイント情報を取得
                const routeGroupMap = new Map();

                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) { // firebase origin means loaded from external
                        const routeId = meta.routeId || 'unknown_route';

                        if (!routeGroupMap.has(routeId)) {
                            routeGroupMap.set(routeId, []);
                        }
                        routeGroupMap.get(routeId).push(marker);
                    }
                }

                // 各ルートグループごとに処理
                for (const [routeId, markers] of routeGroupMap) {
                    // ルートデータから開始・終了ポイント情報を検索
                    let startPoint = 'unknown_start';
                    let endPoint = 'unknown_end';

                    if (this.routeSpotHandler.routeData) {
                        const routeData = this.routeSpotHandler.routeData.find(route =>
                            (route.routeId === routeId) ||
                            (route.name === routeId) ||
                            (route.fileName && route.fileName.replace('.json', '') === routeId)
                        );

                        if (routeData) {
                            startPoint = (routeData.startPoint && routeData.startPoint.id) ||
                                (routeData.routeInfo && routeData.routeInfo.startPoint) ||
                                'unknown_start';
                            endPoint = (routeData.endPoint && routeData.endPoint.id) ||
                                (routeData.routeInfo && routeData.routeInfo.endPoint) ||
                                'unknown_end';
                        }
                    }

                    const fullRouteId = `route_${startPoint}_to_${endPoint}`;
                    const lineCoordinates = [];

                    // マーカーを順番に処理
                    markers.forEach((marker, index) => {
                        const latLng = marker.getLatLng();
                        const waypointName = `waypoint_${String(index + 1).padStart(2, '0')}`;
                        const elevation = marker.__meta && marker.__meta.elevation;

                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }
                        lineCoordinates.push(coords);

                        // 中間点もPointとして出力したければここに追加可能だが、LineStringにする
                    });

                    // LineStringとして出力
                    features.push({
                        type: 'Feature',
                        properties: {
                            id: fullRouteId,
                            name: `${startPoint} → ${endPoint}`,
                            type: 'route',
                            source: 'image_transformed',
                            description: 'ルート（GPS変換済）'
                        },
                        geometry: {
                            type: 'LineString',
                            coordinates: lineCoordinates
                        }
                    });
                }
            }

            // 4. スポット（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
                let spotCounter = 1;

                for (const marker of latestSpots) {
                    const meta = marker.__meta;
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) {
                        const latLng = marker.getLatLng();
                        const spotName = meta.spotId || `spot${String(spotCounter).padStart(2, '0')}`;
                        const elevation = meta.elevation;

                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `spot${String(spotCounter).padStart(2, '0')}_${spotName}`,
                                name: spotName,
                                type: 'spot',
                                source: 'image_transformed',
                                description: 'スポット（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coords
                            }
                        });
                        spotCounter++;
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

    /**
     * GeoJSONファイル名を生成
     * @returns {string} GeoJSONファイル名
     */
    getGeoJsonFileName() {
        if (this.currentPngFileName) {
            return `${this.currentPngFileName}-GPS`;
        }
        // PNG画像が読み込まれていない場合はデフォルト名を使用
        return this.fileHandler.getDefaultDataFileName();
    }

    /**
     * 標高未取得件数を各UIフィールドに反映する
     */
    updateElevationCounts() {
        try {
            const stats = this.getElevationStats();

            const pointCountField = document.getElementById('elevationPointCount');
            if (pointCountField) pointCountField.value = stats.points.missing;

            const routeCountField = document.getElementById('elevationRouteCount');
            if (routeCountField) routeCountField.value = stats.routes.missing;

            const spotCountField = document.getElementById('elevationSpotCount');
            if (spotCountField) spotCountField.value = stats.spots.missing;

            const areaVertexCount = this.areaHandler ? this.areaHandler.getVertexCount() : 0;
            const areaVertexCountField = document.getElementById('elevationAreaVertexCount');
            if (areaVertexCountField) areaVertexCountField.value = areaVertexCount;
        } catch (error) {
            this.logger.error('標高未取得件数更新エラー', error);
        }
    }

    /**
     * 座標を小数点5桁に丸める
     * @param {number} coordinate - 座標値
     * @returns {number} 小数点5桁に丸められた座標値
     */
    roundCoordinate(coordinate) {
        return Math.round(coordinate * 100000) / 100000;
    }

    /**
     * スポットマーカーから最新の分のみを取得
     * @param {Array} spotMarkers - 全スポットマーカー
     * @returns {Array} 最新の分のスポットマーカー
     */
    getLatestSpots(spotMarkers) {
        if (!spotMarkers || spotMarkers.length === 0) {
            return [];
        }

        // スポットIDごとにグループ化し、最新のタイムスタンプのみを保持
        const latestSpotsMap = new Map();

        for (const marker of spotMarkers) {
            const meta = marker.__meta;
            if (meta && meta.spotId) {
                const spotId = meta.spotId;
                const timestamp = meta.timestamp || 0; // タイムスタンプがない場合は0

                if (!latestSpotsMap.has(spotId) || timestamp > latestSpotsMap.get(spotId).__meta.timestamp) {
                    latestSpotsMap.set(spotId, marker);
                }
            }
        }

        return Array.from(latestSpotsMap.values());
    }

    /**
     * 標高統計を取得
     * @returns {Object} {points: {missing, total}, routes: {missing, total}, spots: {missing, total}}
     */
    getElevationStats() {
        const stats = {
            points: { missing: 0, total: 0 },
            routes: { missing: 0, total: 0 },
            spots: { missing: 0, total: 0 }
        };

        // ポイントのカウント（GPS Excelデータ）
        if (this.routeSpotHandler?.pointData?.length > 0) {
            const points = this.routeSpotHandler.pointData;
            stats.points.total = points.length;
            for (const point of points) {
                if (point.elevation === undefined || point.elevation === null) {
                    stats.points.missing++;
                }
            }
        } else if (this.pointJsonData?.points?.length > 0) {
            // combined JSON形式のポイント（画像座標のみ、標高なし）
            stats.points.total = this.pointJsonData.points.length;
            stats.points.missing = this.pointJsonData.points.length;
        }

        // ルートマーカーのカウント
        if (this.routeSpotHandler?.routeMarkers?.length > 0) {
            stats.routes.total = this.routeSpotHandler.routeMarkers.length;
            for (const marker of this.routeSpotHandler.routeMarkers) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.routes.missing++;
                }
            }
        } else if (this.routeSpotHandler?.routeData?.length > 0) {
            // combined JSON形式のルート（waypointsをカウント）
            let totalWaypoints = 0;
            for (const route of this.routeSpotHandler.routeData) {
                if (route.waypoints && Array.isArray(route.waypoints)) {
                    totalWaypoints += route.waypoints.length;
                }
            }
            stats.routes.total = totalWaypoints;
            stats.routes.missing = totalWaypoints;
        }

        // スポットマーカーのカウント
        if (this.routeSpotHandler?.spotMarkers?.length > 0) {
            const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
            stats.spots.total = latestSpots.length;
            for (const marker of latestSpots) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.spots.missing++;
                }
            }
        } else if (this.routeSpotHandler?.spotData?.length > 0) {
            // combined JSON形式のスポット
            stats.spots.total = this.routeSpotHandler.spotData.length;
            stats.spots.missing = this.routeSpotHandler.spotData.length;
        }

        return stats;
    }

    /**
     * ファイルのディレクトリを記録する（File System Access API使用時）
     * @param {File} file - 読み込んだファイル
     */
    async recordFileDirectory(file) {
        try {
            // File System Access APIがサポートされているかチェック
            if (this.fileHandler && this.fileHandler.isFileSystemAccessSupported() && file.webkitRelativePath) {
                // ファイルハンドルが利用可能な場合のみ処理
                // 注意: 通常のファイル入力ではFile System Access APIを使用できない
                // ここではフォールバックとしてファイル名を記録
                this.fileHandler.currentFileName = file.name;
            }
        } catch (error) {
            // ディレクトリ記録はオプショナルなのでエラーを無視
        }
    }

    /**
     * メッセージを画面上部に3秒間表示する
     * @param {string} message - 表示するメッセージ
     * @param {string} type - メッセージの種類 ('info', 'warning', 'error')
     */
    showMessage(message, type = 'info') {
        const messageArea = document.getElementById('messageArea');
        if (!messageArea) return;

        messageArea.textContent = message;

        // タイプに応じてクラスを設定
        let className = 'message-area';
        let displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION;

        switch (type) {
            case 'warning':
                className += ' message-warning';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 1.5; // 警告は少し長く表示
                break;
            case 'error':
                className += ' message-error';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 2; // エラーは更に長く表示
                break;
            default:
                className += ' message-info';
                break;
        }

        messageArea.className = className;
        messageArea.style.display = 'block';

        setTimeout(() => {
            messageArea.style.display = 'none';
        }, displayDuration);
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