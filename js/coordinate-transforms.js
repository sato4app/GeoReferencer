// 座標変換ユーティリティモジュール
// Web Mercator投影とGPS座標間の変換を統一管理
import { Logger } from './utils.js';

export class CoordinateTransforms {
    constructor() {
        this.logger = new Logger('CoordinateTransforms');
        this.EARTH_RADIUS = 6378137; // 地球の半径（メートル）
        this.WEB_MERCATOR_MAX = 20037508.34; // Web Mercator最大値
    }

    // 経度をWeb Mercator X座標に変換
    lonToWebMercatorX(lon) {
        return lon * this.WEB_MERCATOR_MAX / 180;
    }

    // 緯度をWeb Mercator Y座標に変換
    latToWebMercatorY(lat) {
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        return y * this.WEB_MERCATOR_MAX / 180;
    }

    // Web Mercator X座標を経度に変換
    webMercatorXToLon(x) {
        return x * 180 / this.WEB_MERCATOR_MAX;
    }

    // Web Mercator Y座標を緯度に変換
    webMercatorYToLat(y) {
        const lat = y * 180 / this.WEB_MERCATOR_MAX;
        return 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    }

    // メートル/ピクセル変換（Mercator投影補正）
    calculateMetersPerPixel(centerLat, zoomLevel) {
        return 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, zoomLevel);
    }

    // GPS座標間の距離計算（Leaflet.mapのdistanceメソッドと同等）
    calculateGpsDistance(lat1, lng1, lat2, lng2) {
        const R = this.EARTH_RADIUS;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 画像境界から画像座標をGPS座標に変換
    convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight) {
        try {
            if (!imageBounds || !imageWidth || !imageHeight) {
                this.logger.warn('画像境界または画像サイズが不正です');
                return null;
            }

            const southWest = imageBounds.getSouthWest();
            const northEast = imageBounds.getNorthEast();
            
            const xRatio = imageX / imageWidth;
            const yRatio = imageY / imageHeight;
            
            const lng = southWest.lng + (northEast.lng - southWest.lng) * xRatio;
            const lat = northEast.lat - (northEast.lat - southWest.lat) * yRatio;
            
            return [lat, lng];
            
        } catch (error) {
            this.logger.error('画像座標→GPS座標変換エラー', error);
            return null;
        }
    }

    // アフィン変換で画像座標をGPS座標に変換
    applyAffineTransform(imageX, imageY, transformation) {
        try {
            if (!transformation || !transformation.transformation) {
                this.logger.error('変換パラメータが不正です');
                return null;
            }

            const trans = transformation.transformation;
            
            // アフィン変換でWeb Mercator座標に変換
            const webMercatorX = trans.a * imageX + trans.b * imageY + trans.c;
            const webMercatorY = trans.d * imageX + trans.e * imageY + trans.f;
            
            // Web MercatorからGPS座標に変換
            const lat = this.webMercatorYToLat(webMercatorY);
            const lng = this.webMercatorXToLon(webMercatorX);
            
            return [lat, lng];
            
        } catch (error) {
            this.logger.error('アフィン変換エラー', error);
            return null;
        }
    }
}

// シングルトンインスタンスをエクスポート
export const coordinateTransforms = new CoordinateTransforms();