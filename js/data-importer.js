import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';

export class DataImporter {
    constructor(app) {
        this.app = app;
        this.logger = new Logger('DataImporter');
    }

    /**
     * GPS Excelファイル読み込み
     */
    async handleGpsExcelLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            // 既存データがある場合は確認
            const existingCount = this.app.gpsData?.getPoints()?.length || 0;
            let mode = 'clear'; // デフォルトはクリア（初回など）

            if (existingCount > 0) {
                // 追記かクリアかを確認
                const shouldAppend = window.confirm(
                    `既存のGPSポイントデータ(${existingCount}件)があります。\n` +
                    `データを追記しますか？\n\n` +
                    `[OK] 追記する（IDと座標が一致するデータはスキップ）\n` +
                    `[キャンセル] 既存データをクリアして新規読み込み`
                );
                mode = shouldAppend ? 'append' : 'clear';
            }

            this.logger.info(`GPS Excelファイル読み込み開始: ${files.length}ファイル, モード: ${mode}`);

            if (mode === 'clear') {
                this.app.gpsData.gpsPoints = [];
                this.app.gpsData.clearMarkersFromMap();
            }

            let totalLoaded = 0;
            let totalAdded = 0;

            for (const file of files) {
                try {
                    this.logger.info(`Processing file: ${file.name}`);

                    // GPSDataクラスのExcel読み込み機能を使用
                    const rawData = await this.app.fileHandler.loadExcelFile(file);

                    // Excel データを検証・変換
                    const validatedData = this.app.fileHandler.validateAndConvertExcelData(rawData);

                    if (validatedData.length === 0) {
                        this.logger.warn(`有効なデータがありません: ${file.name}`);
                        continue;
                    }

                    totalLoaded += validatedData.length;

                    // マージ（追加）処理
                    const addedCount = this.app.gpsData.mergePoints(validatedData);
                    totalAdded += addedCount;

                    this.logger.info(`ファイル完了: ${file.name}, 追加: ${addedCount}`);

                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                    this.app.showMessage(`エラー(${file.name}): ${fileError.message}`, 'error');
                }
            }

            // 地図上にGPSポイントを表示（全データ再描画）
            if (this.app.mapCore && this.app.mapCore.getMap()) {
                this.app.gpsData.displayPointsOnMap(this.app.mapCore.getMap());
            }

            // GPS ポイント数を更新
            this.app.uiHandlers.updateGpsPointCount(this.app.gpsData);

            // 完了メッセージ
            const currentTotal = this.app.gpsData.getPoints().length;
            if (mode === 'append') {
                this.app.showMessage(`${totalAdded}個のポイントを追加しました (現在合計: ${currentTotal}個)`);
            } else {
                this.app.showMessage(`${currentTotal}個のポイントを読み込みました`);
            }

        } catch (error) {
            this.logger.error('GPS Excel一括読み込みエラー', error);
            errorHandler.handle(error, error.message, 'GPS Excel読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    /**
     * PNG画像ファイル読み込み
     */
    async handlePngLoad(event) {
        try {
            // 既存データがある場合は確認
            if (this.app.currentPngFileName) {
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
            if (this.app.currentPngFileName) {
                // 画像クリア
                if (this.app.imageOverlay) {
                    // Leaflet ImageOverlayを地図から削除
                    if (this.app.imageOverlay.imageOverlay && this.app.mapCore && this.app.mapCore.getMap()) {
                        this.app.mapCore.getMap().removeLayer(this.app.imageOverlay.imageOverlay);
                    }
                    // ImageOverlayの内部状態をクリア
                    this.app.imageOverlay.imageOverlay = null;
                    this.app.imageOverlay.currentImage = new Image(); // 新しいImageオブジェクトを作成
                    this.app.imageOverlay.currentImageFileName = null;
                    this.app.imageOverlay.resetTransformation();
                }

                // ポイント・ルート・スポットクリア
                if (this.app.routeSpotHandler) {
                    this.app.routeSpotHandler.pointData = [];
                    this.app.routeSpotHandler.routeData = [];
                    this.app.routeSpotHandler.spotData = [];
                    this.app.routeSpotHandler.clearAllMarkers();
                }

                this.app.currentPngFileName = null;
            }

            // PNGファイル名を記録（拡張子を除去）
            this.app.currentPngFileName = file.name.replace(/\.[^/.]+$/, '');
            this.logger.info('PNGファイル:', this.app.currentPngFileName);

            // ファイル名を表示
            const pngFileNameField = document.getElementById('pngFileName');
            if (pngFileNameField) {
                pngFileNameField.value = file.name;
                pngFileNameField.title = file.name; // ツールチップでも表示
            }

            // PNG画像を読み込み
            if (this.app.imageOverlay) {
                await this.app.imageOverlay.loadImage(file);
            }

            // 成功メッセージを表示
            this.app.showMessage(`PNG画像ファイルを読み込みました:\n${file.name}`);

        } catch (error) {
            this.logger.error('PNG読み込みエラー', error);
            errorHandler.handle(error, 'PNG画像の読み込みに失敗しました。', 'PNG読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    /**
     * ポイント(座標)JSONファイル読み込み
     */
    async handlePointCoordJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ポイント(座標)JSONファイル読み込み開始', file.name);

            // JSONファイルを読み込んでポイント座標情報を処理
            const text = await file.text();
            const data = JSON.parse(text);

            // ポイントJSONデータを保存
            this.app.pointJsonData = data;
            this.app.georeferencing.setPointJsonData(data);

            // imageX, imageYを持つポイントを画像上に表示
            if (this.app.imageOverlay && data) {
                // 既存のマーカーをクリア
                this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');

                this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'points', this.app.imageCoordinateMarkers);

                // GeoreferencingクラスにもmarkerInfoを渡す
                this.app.imageCoordinateMarkers.forEach(markerInfo => {
                    this.app.georeferencing.addImageCoordinateMarker(markerInfo);
                });

                this.logger.info(`ポイントマーカー登録完了: ${this.app.imageCoordinateMarkers.length}個`);
            }

            // ポイント座標数を更新
            this.app.uiHandlers.updatePointCoordCount(this.app.pointJsonData);

            this.logger.info('ポイント(座標)JSON読み込み完了', data);

        } catch (error) {
            this.logger.error('ポイント(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ポイント(座標)JSONファイルの読み込みに失敗しました。', 'ポイント(座標)JSON読み込み');
        }
    }

    /**
     * ルート・スポット(座標)JSONファイル読み込み
     */
    async handleRouteSpotJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            const dataItems = [];

            // ファイルの読み込み
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    dataItems.push({
                        data: data,
                        fileName: file.name
                    });
                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                }
            }

            // RouteSpotHandlerに処理を委譲（自動判定するため、selectedRouteSpotTypeは不要）
            if (dataItems.length > 0) {
                await this.app.routeSpotHandler.importRouteSpotData(dataItems);
            }

            // ルート・スポット数を更新
            this.app.uiHandlers.updateRouteSpotCount(this.app.routeSpotHandler);

            // 成功メッセージ
            this.app.showMessage(`${dataItems.length}件のファイルを読み込みました`);

        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        } finally {
            event.target.value = '';
        }
    }

    /**
     * 汎用JSONファイル読み込み
     */
    async handleJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            this.logger.info(`複数JSONファイル読み込み開始: ${files.length}ファイル`);
            this.app.showMessage('JSONファイルを読み込んでいます...');

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
                    const detectedType = this.app.routeSpotHandler.detectJsonType(data);

                    if (detectedType === 'route') {
                        // ルートデータの場合 (画像座標として表示)
                        // データをrouteSpotHandlerに格納（カウント・エクスポート用）
                        const routes = this.app.routeSpotHandler.processRouteData(data, file.name);
                        this.app.routeSpotHandler.routeData = this.app.routeSpotHandler.mergeAndDeduplicate(
                            this.app.routeSpotHandler.routeData, routes, 'route'
                        );
                        // 画像上にルート中間点を表示
                        if (shouldClearMarkers) {
                            this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.app.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'route', this.app.imageCoordinateMarkers);
                        routesProcessed++;

                    } else if (detectedType === 'spot') {
                        // スポットデータの場合 (画像座標として表示)
                        // データをrouteSpotHandlerに格納（カウント・エクスポート用）
                        const spots = this.app.routeSpotHandler.processSpotData(data, file.name);
                        this.app.routeSpotHandler.spotData = this.app.routeSpotHandler.mergeAndDeduplicate(
                            this.app.routeSpotHandler.spotData, spots, 'spot'
                        );
                        // 画像上にスポットを表示
                        if (shouldClearMarkers) {
                            this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.app.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'spot', this.app.imageCoordinateMarkers);
                        if (data.spots && Array.isArray(data.spots)) {
                            spotsProcessed += data.spots.length;
                        } else {
                            spotsProcessed++;
                        }

                    } else if (detectedType === 'point') {
                        // ポイントデータの場合 (画像処理用)
                        this.app.pointJsonData = data;
                        this.app.georeferencing.setPointJsonData(data);

                        // 画像上にポイント座標を表示
                        if (this.app.imageOverlay && data.points) {
                            // 最初のポイントファイル処理時のみマーカーをクリア
                            if (shouldClearMarkers) {
                                this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                                this.app.imageCoordinateMarkers = []; // マーカー配列もクリア
                                shouldClearMarkers = false;
                            }

                            this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'points', this.app.imageCoordinateMarkers);

                            // GeoreferencingクラスにもmarkerInfoを渡す
                            this.app.imageCoordinateMarkers.forEach(markerInfo => {
                                this.app.georeferencing.addImageCoordinateMarker(markerInfo);
                            });

                            this.logger.info(`ポイント: ${this.app.imageCoordinateMarkers.length}個`);
                        }

                        pointsProcessed++;

                    } else if (detectedType === 'area') {
                        // エリアデータの場合 (画像座標として表示)
                        if (data.areas && Array.isArray(data.areas)) {
                            await this.app.areaHandler.importAreas(data.areas, this.app.imageOverlay);
                            areasProcessed += data.areas.length;
                        }

                    } else if (detectedType === 'combined') {
                        // 複合形式の場合 (points/routes/spots/areasが1ファイルに格納)
                        const combinedData = data.data;

                        if (shouldClearMarkers) {
                            this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.app.imageCoordinateMarkers = [];
                            shouldClearMarkers = false;
                        }

                        // 画像上に全座標を表示（points, routes waypoints, spots）
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'combined', this.app.imageCoordinateMarkers);

                        // GeoreferencingクラスにもmarkerInfoを渡す（重ね合わせ時に位置更新されるよう）
                        this.app.imageCoordinateMarkers.forEach(markerInfo => {
                            this.app.georeferencing.addImageCoordinateMarker(markerInfo);
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
                            this.app.pointJsonData = pointData;
                            this.app.georeferencing.setPointJsonData(pointData);
                            pointsProcessed += combinedData.points.length;
                        }

                        // ルートデータを格納（カウント用）
                        if (combinedData.routes && Array.isArray(combinedData.routes)) {
                            combinedData.routes.forEach(route => {
                                this.app.routeSpotHandler.routeData.push({
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
                                this.app.routeSpotHandler.spotData.push({
                                    ...spot,
                                    fileName: file.name,
                                    spotId: spot.name || `${file.name}_spot`
                                });
                            });
                            spotsProcessed += combinedData.spots.length;
                        }

                        // エリアデータを処理・表示
                        if (combinedData.areas && Array.isArray(combinedData.areas)) {
                            await this.app.areaHandler.importAreas(combinedData.areas, this.app.imageOverlay);
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
            if (allGpsPoints.length > 0 && this.app.gpsData) {
                this.app.gpsData.setPointsFromExcelData(allGpsPoints);
                if (this.app.mapCore && this.app.mapCore.map) {
                    this.app.gpsData.displayPointsOnMap(this.app.mapCore.map);
                }
                this.app.uiHandlers.updateGpsPointCount(this.app.gpsData);
            }

            // GeoJSON由来の参照レイヤーを表示
            if (otherGeoJsonFeatures.length > 0 && this.app.mapCore && this.app.mapCore.map) {
                if (this.app.referenceLayer) {
                    this.app.mapCore.map.removeLayer(this.app.referenceLayer);
                }
                this.app.referenceLayer = L.geoJSON(otherGeoJsonFeatures, {
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
                }).addTo(this.app.mapCore.map);
            }

            // UIを更新
            if (this.app.pointJsonData) {
                this.app.uiHandlers.updatePointCoordCount(this.app.pointJsonData);
            }
            this.app.uiHandlers.updateRouteSpotCount(this.app.routeSpotHandler);
            this.app.uiHandlers.updateAreaCount(this.app.areaHandler.areas ? this.app.areaHandler.areas.length : 0);

            this.logger.info(`読み込み完了 - GeoJSON: ${geoJsonProcessed}, ポイント: ${pointsProcessed}, ルート: ${routesProcessed}, スポット: ${spotsProcessed}, エリア: ${areasProcessed}`);

            // 成功メッセージを表示
            this.app.showMessage(`ファイルを読み込みました (GeoJSON: ${geoJsonProcessed}, その他: ${files.length - geoJsonProcessed})`);

        } catch (error) {
            this.logger.error('JSON読み込みエラー', error);
            errorHandler.handle(error, 'JSONファイルの読み込みに失敗しました。', 'JSON読み込み');
        } finally {
            event.target.value = '';
        }
    }
}
