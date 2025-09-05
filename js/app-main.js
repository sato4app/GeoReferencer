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

            // ルート・スポットJSON読み込みボタン
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

            // 透過度スライダー
            const opacityInput = document.getElementById('opacityInput');
            if (opacityInput) {
                opacityInput.addEventListener('input', (event) => {
                    this.handleOpacityChange(event.target.value);
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

    async handleRouteSpotJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ルート・スポットJSONファイル読み込み開始', file.name);
            
            // JSONファイルを読み込んでルートやスポット情報を処理
            const text = await file.text();
            const data = JSON.parse(text);
            
            // ここで必要に応じてルートやスポット情報を地図上に表示
            this.logger.info('ルート・スポットJSON読み込み完了', data);
            
        } catch (error) {
            this.logger.error('ルート・スポットJSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポットJSONファイルの読み込みに失敗しました。', 'ルート・スポットJSON読み込み');
        }
    }

    async handleMatchPoints() {
        try {
            this.logger.info('画像重ね合わせ処理開始');
            
            if (!this.imageOverlay || !this.gpsData) {
                throw new Error('画像とGPSデータの両方が読み込まれている必要があります。');
            }

            // 簡易的なマッチング結果を表示（実際のジオリファレンス機能は今後実装）
            const gpsPoints = this.gpsData.getPoints();
            const result = {
                matchedCount: gpsPoints.length,
                unmatchedPoints: []
            };
            
            // 結果を表示
            this.updateMatchResults(result);
            
            this.logger.info('画像重ね合わせ処理完了', result);
            
        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, '画像の重ね合わせ処理に失敗しました。', '画像重ね合わせ');
        }
    }

    handleOpacityChange(value) {
        try {
            if (this.imageOverlay) {
                this.imageOverlay.setOpacity(value / 100);
                this.logger.debug('透過度変更', value);
            }
        } catch (error) {
            this.logger.error('透過度変更エラー', error);
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
                unmatchedPointsField.value = result.unmatchedPoints ? 
                    result.unmatchedPoints.join('\n') : '';
            }
            
        } catch (error) {
            this.logger.error('マッチング結果表示エラー', error);
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