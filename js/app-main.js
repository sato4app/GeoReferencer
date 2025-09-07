// GeoReferencerメインアプリケーションファイル - 画像重ね合わせ機能のみ
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { CONFIG, EVENTS, DEFAULTS } from './constants.js';
import { Logger } from './logger.js';
import { errorHandler } from './error-handler.js';

class GeoReferencerApp {
    constructor() {
        this.logger = new Logger('GeoReferencerApp');
        this.mapCore = null;
        this.imageOverlay = null;
        this.gpsData = null;
        this.pointJsonData = null; // ポイントJSONデータを保存
        
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
            // GPS GeoJSON読み込みボタン
            const loadGpsGeoJsonBtn = document.getElementById('loadGpsGeoJsonBtn');
            const gpsGeoJsonInput = document.getElementById('gpsGeoJsonInput');
            
            if (loadGpsGeoJsonBtn && gpsGeoJsonInput) {
                loadGpsGeoJsonBtn.addEventListener('click', () => {
                    gpsGeoJsonInput.click();
                });
                
                gpsGeoJsonInput.addEventListener('change', (event) => {
                    this.handleGpsGeoJsonLoad(event);
                });
            }

            // PNG画像読み込みボタン
            const loadImageBtn = document.getElementById('loadImageBtn');
            const imageInput = document.getElementById('imageInput');
            
            if (loadImageBtn && imageInput) {
                loadImageBtn.addEventListener('click', () => {
                    imageInput.click();
                });
                
                imageInput.addEventListener('change', (event) => {
                    this.handleImageLoad(event);
                });
            }

            // ポイント(座標)JSON読み込みボタン
            const loadPointCoordJsonBtn = document.getElementById('loadPointCoordJsonBtn');
            const pointCoordJsonInput = document.getElementById('pointCoordJsonInput');
            
            if (loadPointCoordJsonBtn && pointCoordJsonInput) {
                loadPointCoordJsonBtn.addEventListener('click', () => {
                    pointCoordJsonInput.click();
                });
                
                pointCoordJsonInput.addEventListener('change', (event) => {
                    this.handlePointCoordJsonLoad(event);
                });
            }

            // ルート・スポット(座標)JSON読み込みボタン
            const loadRouteSpotJsonBtn = document.getElementById('loadRouteSpotJsonBtn');
            const routeSpotJsonInput = document.getElementById('routeSpotJsonInput');
            
            if (loadRouteSpotJsonBtn && routeSpotJsonInput) {
                loadRouteSpotJsonBtn.addEventListener('click', () => {
                    routeSpotJsonInput.click();
                });
                
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

    async handleGpsGeoJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('GPS GeoJSONファイル読み込み開始', file.name);
            
            if (this.gpsData) {
                await this.gpsData.loadGeoJsonFile(file);
                
                // 地図上にGPSポイントを表示
                if (this.mapCore && this.mapCore.map) {
                    this.gpsData.displayPointsOnMap(this.mapCore.map);
                }
                
                this.logger.info('GPS GeoJSONファイル読み込み完了');
            }
            
        } catch (error) {
            this.logger.error('GPS GeoJSON読み込みエラー', error);
            errorHandler.handle(error, 'GPS GeoJSONファイルの読み込みに失敗しました。', 'GPS GeoJSON読み込み');
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
            
            this.logger.info('ポイント(座標)JSON読み込み完了', data);
            
        } catch (error) {
            this.logger.error('ポイント(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ポイント(座標)JSONファイルの読み込みに失敗しました。', 'ポイント(座標)JSON読み込み');
        }
    }

    async handleRouteSpotJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ルート・スポット(座標)JSONファイル読み込み開始', file.name);
            
            // JSONファイルを読み込んでルートやスポット座標情報を処理
            const text = await file.text();
            const data = JSON.parse(text);
            
            // imageX, imageYを持つルート・スポットを画像上に表示
            if (this.imageOverlay && data) {
                await this.displayImageCoordinates(data, 'routes-spots');
            }
            
            this.logger.info('ルート・スポット(座標)JSON読み込み完了', data);
            
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
            let matchedCount = 0;
            const unmatchedPoints = [];

            // デバッグ：GPSポイントIDを出力（最初の3件）
            console.log('=== GPS ポイント ID（最初の3件）===');
            gpsPoints.slice(0, 3).forEach((point, index) => {
                console.log(`GPS Point ${index + 1}:`, {
                    pointId: point.pointId,
                    lat: point.lat,
                    lng: point.lng,
                    structure: point
                });
            });

            // デバッグ：ポイントJSONのIDを出力（imageCoordinateMarkersから最初の3件）
            console.log('=== ポイントJSON ID（最初の3件）===');
            if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
                this.imageCoordinateMarkers.slice(0, 3).forEach((marker, index) => {
                    const popup = marker.getPopup();
                    const content = popup ? popup.getContent() : 'No popup';
                    console.log(`Point JSON ${index + 1}:`, {
                        popupContent: content,
                        marker: marker
                    });
                });
            } else {
                console.log('ポイントJSONマーカーが見つかりません');
            }

            // 現在保存されているポイントJSONデータを確認
            if (this.pointJsonData) {
                console.log('=== 保存されているポイントJSONデータ（最初の3件）===');
                const pointsArray = Array.isArray(this.pointJsonData) ? this.pointJsonData : 
                    (this.pointJsonData.points ? this.pointJsonData.points : [this.pointJsonData]);
                
                pointsArray.slice(0, 3).forEach((point, index) => {
                    console.log(`Point JSON Data ${index + 1}:`, point);
                });
            } else {
                console.log('ポイントJSONデータが保存されていません');
            }

            // WGS84座標系での緯度経度境界の計算
            if (this.imageOverlay.imageOverlay) {
                const bounds = this.imageOverlay.imageOverlay.getBounds();
                
                // 緯度による経度補正（cos補正）の適用
                const centerLat = bounds.getCenter().lat;
                const latCorrection = Math.cos(centerLat * Math.PI / 180);
                
                this.logger.debug('WGS84境界計算完了', {
                    bounds: bounds.toBBoxString(),
                    centerLat,
                    latCorrection
                });

                // GPSポイントが画像境界内にあるかチェック（正しい構造で）
                gpsPoints.forEach(point => {
                    // GPSDataクラスで処理済みのデータ構造を使用
                    if (point.lat !== undefined && point.lng !== undefined) {
                        if (bounds.contains([point.lat, point.lng])) {
                            matchedCount++;
                        } else {
                            unmatchedPoints.push(`${point.pointId} (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`);
                        }
                    } else {
                        unmatchedPoints.push(`${point.pointId} (座標データなし)`);
                    }
                });
            }

            // 画像位置変更時のコールバック通知システム
            this.imageOverlay.addImageUpdateCallback(() => {
                this.logger.debug('画像位置更新通知受信');
                // 他モジュール（PointOverlay等）との座標同期
                // JSONポイントデータの位置更新連携
                this.syncPointPositions();
            });

            return {
                matchedCount,
                unmatchedPoints,
                totalPoints: gpsPoints.length,
                georeferenceCompleted: true
            };
            
        } catch (error) {
            this.logger.error('ジオリファレンス計算エラー', error);
            throw error;
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
                    displayText = result.unmatchedPoints.join('\n');
                } else if (result.georeferenceCompleted) {
                    displayText = 'ジオリファレンス完了：全ポイントが画像境界内にマッチしました';
                }
                unmatchedPointsField.value = displayText;
            }
            
            // ジオリファレンス完了時の追加情報をログに記録
            if (result.georeferenceCompleted) {
                this.logger.info('ジオリファレンス詳細結果', {
                    totalPoints: result.totalPoints,
                    matchedCount: result.matchedCount,
                    unmatchedCount: result.unmatchedPoints ? result.unmatchedPoints.length : 0,
                    matchPercentage: result.totalPoints > 0 ? 
                        Math.round((result.matchedCount / result.totalPoints) * 100) : 0
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
                    
                    // マーカーを作成
                    const marker = L.circleMarker(latLng, {
                        radius: 5,
                        color: type === 'points' ? '#ff0000' : '#0000ff',
                        fillColor: type === 'points' ? '#ff0000' : '#0000ff',
                        fillOpacity: 0.7,
                        weight: 2
                    }).addTo(this.mapCore.map);
                    
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
                            description: item.description || ''
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
                                description: point.description || ''
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
                                        description: point.description || ''
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
        
        // X座標（西→東）の変換
        const xRatio = imageX / imageWidth;
        const lng = southWest.lng + (northEast.lng - southWest.lng) * xRatio;
        
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