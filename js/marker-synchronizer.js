// マーカー同期処理専用モジュール
import { Logger } from './utils.js';

export class MarkerSynchronizer {
    constructor(mapCore, routeSpotHandler, coordinateDisplay) {
        this.logger = new Logger('MarkerSynchronizer');
        this.mapCore = mapCore;
        this.routeSpotHandler = routeSpotHandler;
        this.coordinateDisplay = coordinateDisplay;
    }

    /**
     * 全ポイントの位置同期
     * @param {Object} currentTransformation
     * @param {Array} imageCoordinateMarkers
     */
    syncAllPositions(currentTransformation, imageCoordinateMarkers) {
        try {
            if (!currentTransformation) {
                this.syncPointPositionsBasedOnImageBounds(imageCoordinateMarkers);
                return;
            }
            this.updateMarkerPositions(true, currentTransformation, imageCoordinateMarkers);
            this.syncRouteSpotPositions(currentTransformation);
        } catch (error) {
            this.logger.error('全体位置同期エラー', error);
        }
    }

    /**
     * ポイント位置同期（ジオリファレンス変換ベース）
     */
    updateMarkerPositions(useTransformation, currentTransformation, imageCoordinateMarkers) {
        const georefMarkers = imageCoordinateMarkers.filter(markerInfo =>
            markerInfo.type === 'georeference-point'
        );

        georefMarkers.forEach((markerInfo, index) => {
            const marker = markerInfo.marker;
            const data = markerInfo.data;

            if (!data || data.imageX === undefined || data.imageY === undefined) {
                this.logger.warn(`マーカー${index}: 画像座標データが不完全`, data);
                return;
            }

            let newLatLng;
            let popupDescription;

            if (useTransformation && currentTransformation) {
                // ジオリファレンス変換使用
                newLatLng = this.transformImageCoordsToGps(data.imageX, data.imageY, currentTransformation);
                popupDescription = 'ジオリファレンス変換適用済み';
            } else {
                // 画像境界ベース変換使用
                if (this.coordinateDisplay) {
                    newLatLng = this.coordinateDisplay.convertImageToLatLng(data.imageX, data.imageY);
                    popupDescription = '画像境界ベース変換';
                }
            }

            if (newLatLng) {
                marker.setLatLng(newLatLng);
                const updatedPopupContent = data.name || data.id || 'ポイント';
                marker.bindPopup(updatedPopupContent);
            }
        });
    }

    /**
     * 画像境界ベースの位置同期
     */
    syncPointPositionsBasedOnImageBounds(imageCoordinateMarkers) {
        try {
            this.updateMarkerPositions(false, null, imageCoordinateMarkers);
        } catch (error) {
            this.logger.error('画像境界ベース位置同期エラー', error);
        }
    }

    /**
     * ルート・スポット位置同期
     */
    syncRouteSpotPositions(currentTransformation) {
        try {
            if (!this.routeSpotHandler) {
                this.logger.warn('⚠️ RouteSpotHandlerが設定されていません。ルート・スポット同期をスキップします。');
                return;
            }

            // ルートマーカーの位置同期
            if (this.routeSpotHandler.routeMarkers && this.routeSpotHandler.routeMarkers.length > 0) {
                this.syncRouteMarkers(currentTransformation);
            }

            // スポットマーカーの位置同期
            if (this.routeSpotHandler.spotMarkers && this.routeSpotHandler.spotMarkers.length > 0) {
                this.syncSpotMarkers(currentTransformation);
            }

        } catch (error) {
            this.logger.error('❌ ルート・スポット位置同期エラー', error);
        }
    }

    /**
     * ルートマーカー同期
     */
    syncRouteMarkers(currentTransformation) {
        try {
            if (!this.routeSpotHandler || !this.routeSpotHandler.routeMarkers) {
                return;
            }

            let movedMarkers = 0;

            this.routeSpotHandler.routeMarkers.forEach((marker) => {
                const meta = marker.__meta;
                if (marker.setLatLng && typeof marker.setLatLng === 'function') {
                    if (meta && meta.origin === 'image' && meta.imageX !== undefined && meta.imageY !== undefined) {
                        const newPos = this.transformImageCoordsToGps(meta.imageX, meta.imageY, currentTransformation);
                        if (newPos) {
                            marker.setLatLng(newPos);
                            movedMarkers++;
                        }
                    }
                } else if (marker.getLatLngs && typeof marker.getLatLngs === 'function') {
                    // ポリライン処理
                    const currentLatLngs = marker.getLatLngs();
                    const metaPoints = (marker.__meta && Array.isArray(marker.__meta.points)) ? marker.__meta.points : [];
                    const newLatLngs = currentLatLngs.map((latlng, i) => {
                        const pMeta = metaPoints[i];
                        if (pMeta && pMeta.origin === 'image' && pMeta.imageX !== undefined && pMeta.imageY !== undefined) {
                            const newPos = this.transformImageCoordsToGps(pMeta.imageX, pMeta.imageY, currentTransformation);
                            if (newPos) {
                                movedMarkers++;
                                return newPos;
                            }
                        }
                        return [latlng.lat, latlng.lng];
                    });
                    marker.setLatLngs(newLatLngs);
                }
            });

        } catch (error) {
            this.logger.error('❌ ルートマーカー同期エラー', error);
        }
    }

    /**
     * スポットマーカー同期
     */
    syncSpotMarkers(currentTransformation) {
        try {
            if (!this.routeSpotHandler || !this.routeSpotHandler.spotMarkers) {
                return;
            }

            let moved = 0;

            this.routeSpotHandler.spotMarkers.forEach((marker) => {
                const meta = marker.__meta;
                if (meta && meta.origin === 'image' && meta.imageX !== undefined && meta.imageY !== undefined) {
                    const newPos = this.transformImageCoordsToGps(meta.imageX, meta.imageY, currentTransformation);
                    if (newPos) {
                        marker.setLatLng(newPos);
                        moved++;
                    }
                }
            });

        } catch (error) {
            this.logger.error('❌ スポットマーカー同期エラー', error);
        }
    }

    /**
     * 座標変換ユーティリティ
     */
    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            if (transformation && transformation.type === 'precise') {
                // mathUtilsのアフィン変換を使用
                const mathUtils = require('./math-utils.js').mathUtils;
                return mathUtils.applyAffineTransform(imageX, imageY, transformation);
            }
            return null;
        } catch (error) {
            this.logger.error('座標変換エラー', error);
            return null;
        }
    }
}