// GPS データ処理機能を管理するモジュール - GeoJSON対応版
import { Logger } from './logger.js';
import { errorHandler } from './error-handler.js';

export class GPSData {
    constructor() {
        this.logger = new Logger('GPSData');
        this.gpsMarkers = []; // GPSマーカーとデータを保持
        this.gpsPoints = []; // GPSポイントデータ
        this.map = null;
    }

    // GeoJSONファイル読み込み処理
    async loadGeoJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const geoJsonData = JSON.parse(e.target.result);
                    const processedData = this.processGeoJsonData(geoJsonData);
                    this.gpsPoints = processedData;
                    
                    this.logger.info('GeoJSON読み込み完了', processedData.length + 'ポイント');
                    resolve(processedData);
                } catch (error) {
                    this.logger.error('GeoJSON処理エラー', error);
                    reject(new Error('GeoJSONデータの処理に失敗しました: ' + error.message));
                }
            };
            
            reader.onerror = () => {
                const error = new Error('ファイルの読み込みに失敗しました');
                this.logger.error('ファイル読み込みエラー', error);
                reject(error);
            };
            
            reader.readAsText(file);
        });
    }

    // GeoJSONデータ処理
    processGeoJsonData(geoJsonData) {
        const processedData = [];
        
        try {
            if (geoJsonData.type === 'FeatureCollection' && geoJsonData.features) {
                // FeatureCollection形式の場合
                geoJsonData.features.forEach((feature, index) => {
                    if (feature.geometry && feature.geometry.type === 'Point') {
                        const coordinates = feature.geometry.coordinates;
                        const properties = feature.properties || {};
                        
                        const point = {
                            pointId: properties.id || properties.name || `Point_${index + 1}`,
                            lat: coordinates[1],
                            lng: coordinates[0],
                            elevation: coordinates[2] || properties.elevation || 0,
                            location: properties.location || properties.description || '',
                            gpsElevation: properties.gpsElevation || 0
                        };
                        
                        processedData.push(point);
                    }
                });
            } else if (geoJsonData.type === 'Feature' && geoJsonData.geometry) {
                // 単一Feature形式の場合
                if (geoJsonData.geometry.type === 'Point') {
                    const coordinates = geoJsonData.geometry.coordinates;
                    const properties = geoJsonData.properties || {};
                    
                    const point = {
                        pointId: properties.id || properties.name || 'Point_1',
                        lat: coordinates[1],
                        lng: coordinates[0],
                        elevation: coordinates[2] || properties.elevation || 0,
                        location: properties.location || properties.description || '',
                        gpsElevation: properties.gpsElevation || 0
                    };
                    
                    processedData.push(point);
                }
            }
            
            this.logger.info('GeoJSONデータ処理完了', processedData.length + 'ポイント処理');
            return processedData;
            
        } catch (error) {
            this.logger.error('GeoJSONデータ処理エラー', error);
            throw new Error('GeoJSONデータの形式が正しくありません');
        }
    }

    // 地図上にGPSポイントを表示
    displayPointsOnMap(map) {
        try {
            this.map = map;
            this.clearMarkersFromMap();
            
            if (!this.gpsPoints || this.gpsPoints.length === 0) {
                this.logger.warn('表示するGPSポイントがありません');
                return;
            }

            this.gpsPoints.forEach((point, index) => {
                const marker = L.marker([point.lat, point.lng], {
                    title: point.pointId
                }).addTo(map);
                
                // ポップアップを設定
                const popupContent = this.createPopupContent(point);
                marker.bindPopup(popupContent);
                
                // マーカーを保存
                this.gpsMarkers.push({
                    marker: marker,
                    data: point,
                    index: index
                });
            });
            
            // 地図の表示範囲を調整
            if (this.gpsMarkers.length > 0) {
                const group = new L.featureGroup(this.gpsMarkers.map(item => item.marker));
                map.fitBounds(group.getBounds().pad(0.1));
            }
            
            this.logger.info('GPS ポイント表示完了', this.gpsMarkers.length + 'ポイント');
            
        } catch (error) {
            this.logger.error('GPS ポイント表示エラー', error);
            errorHandler.handle(error, 'GPSポイントの表示に失敗しました。', 'GPS ポイント表示');
        }
    }

    // ポップアップコンテンツ作成
    createPopupContent(point) {
        const dmsLat = this.decimalToDMS(point.lat, 'lat');
        const dmsLng = this.decimalToDMS(point.lng, 'lng');
        
        return `
            <div class="gps-popup">
                <h4>${point.pointId}</h4>
                <p><strong>緯度:</strong> ${point.lat.toFixed(6)}</p>
                <p><strong>経度:</strong> ${point.lng.toFixed(6)}</p>
                <p><strong>DMS:</strong> ${dmsLat} / ${dmsLng}</p>
                <p><strong>標高:</strong> ${point.elevation}m</p>
                ${point.location ? `<p><strong>場所:</strong> ${point.location}</p>` : ''}
            </div>
        `;
    }

    // 10進数から度分秒(DMS)形式に変換
    decimalToDMS(decimal, type) {
        const abs = Math.abs(decimal);
        const degrees = Math.floor(abs);
        const minutesFloat = (abs - degrees) * 60;
        const minutes = Math.floor(minutesFloat);
        const seconds = Math.round((minutesFloat - minutes) * 60 * 100) / 100;
        
        const direction = type === 'lat' ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
        
        return `${degrees}°${minutes}'${seconds}"${direction}`;
    }

    // 地図からマーカーを削除
    clearMarkersFromMap() {
        try {
            this.gpsMarkers.forEach(item => {
                if (this.map && item.marker) {
                    this.map.removeLayer(item.marker);
                }
            });
            this.gpsMarkers = [];
            this.logger.debug('GPS マーカー削除完了');
        } catch (error) {
            this.logger.error('GPS マーカー削除エラー', error);
        }
    }

    // GPSポイントデータ取得
    getPoints() {
        return this.gpsPoints;
    }

    // 特定のポイントを取得
    getPointById(pointId) {
        return this.gpsPoints.find(point => point.pointId === pointId);
    }

    // 最も近いポイントを検索
    findNearestPoint(targetLat, targetLng, maxDistance = 0.001) {
        let nearest = null;
        let minDistance = Infinity;
        
        this.gpsPoints.forEach(point => {
            const distance = this.calculateDistance(targetLat, targetLng, point.lat, point.lng);
            if (distance < minDistance && distance <= maxDistance) {
                minDistance = distance;
                nearest = point;
            }
        });
        
        return nearest;
    }

    // 2点間の距離計算（簡易版）
    calculateDistance(lat1, lng1, lat2, lng2) {
        const dlat = lat2 - lat1;
        const dlng = lng2 - lng1;
        return Math.sqrt(dlat * dlat + dlng * dlng);
    }

    // GeoJSON形式でエクスポート
    exportAsGeoJson() {
        try {
            const features = this.gpsPoints.map(point => ({
                type: 'Feature',
                properties: {
                    id: point.pointId,
                    location: point.location,
                    elevation: point.elevation,
                    gpsElevation: point.gpsElevation
                },
                geometry: {
                    type: 'Point',
                    coordinates: [point.lng, point.lat, point.elevation]
                }
            }));
            
            const geoJson = {
                type: 'FeatureCollection',
                features: features
            };
            
            this.logger.info('GeoJSON エクスポート完了', features.length + 'ポイント');
            return geoJson;
            
        } catch (error) {
            this.logger.error('GeoJSON エクスポートエラー', error);
            throw new Error('GeoJSONのエクスポートに失敗しました');
        }
    }

    // ポイント数取得
    getPointCount() {
        return this.gpsPoints.length;
    }
}