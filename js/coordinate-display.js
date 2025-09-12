// 画像座標表示・変換機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { coordinateTransforms } from './coordinate-transforms.js';

export class CoordinateDisplay {
    constructor(mapCore, imageOverlay) {
        this.logger = new Logger('CoordinateDisplay');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
    }

    async displayImageCoordinates(data, type, imageCoordinateMarkers) {
        try {
            if (!this.imageOverlay || !this.mapCore || !this.mapCore.getMap()) {
                throw new Error('地図または画像オーバーレイが初期化されていません。');
            }

            const coordinates = this.extractImageCoordinates(data);
            
            this.logger.info(`${type}の座標表示開始`, coordinates.length + 'ポイント');

            coordinates.forEach((coord, index) => {
                if (coord.imageX !== undefined && coord.imageY !== undefined) {
                    const latLng = this.convertImageToLatLng(coord.imageX, coord.imageY);
                    const markerType = this.determineMarkerType(coord, type);
                    const marker = this.createCustomMarker(latLng, markerType).addTo(this.mapCore.getMap());
                    
                    const popupContent = `
                        <div>
                            <strong>${coord.name || `${type} ${index + 1}`}</strong><br>
                            画像座標: (${coord.imageX}, ${coord.imageY})<br>
                            ${coord.description || ''}
                        </div>
                    `;
                    marker.bindPopup(popupContent);
                    
                    if (!imageCoordinateMarkers) {
                        imageCoordinateMarkers = [];
                    }
                    
                    imageCoordinateMarkers.push({
                        marker: marker,
                        type: 'georeference-point',
                        data: coord
                    });
                }
            });

            this.logger.info(`${type}の座標表示完了`, coordinates.length + 'ポイント表示');
            
            return imageCoordinateMarkers;
            
        } catch (error) {
            this.logger.error('画像座標表示エラー', error);
            throw error;
        }
    }

    extractImageCoordinates(data) {
        const coordinates = [];
        
        try {
            if (Array.isArray(data)) {
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
        if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        const imageBounds = this.imageOverlay.imageOverlay.getBounds();
        const imageInfo = this.imageOverlay.getCurrentImageInfo();
        
        if (!imageBounds || !imageInfo.isLoaded) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
        const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
        
        if (!imageWidth || !imageHeight) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        return coordinateTransforms.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
    }

    determineMarkerType(coord, type) {
        if (coord.type === 'waypoint') {
            return 'wayPoint';
        } else if (coord.type === 'spot' && coord.name) {
            return 'spot';
        } else if (!coord.type && coord.id) {
            return 'pointJSON';
        }
        return 'pointJSON';
    }

    createCustomMarker(latLng, markerType) {
        switch (markerType) {
            case 'pointJSON':
                return L.circleMarker(latLng, {
                    radius: 6,
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 1,
                    weight: 0,
                    pane: 'pointJsonMarkers'
                });
                
            case 'wayPoint':
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
                
            case 'spot':
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

    clearImageCoordinateMarkers(imageCoordinateMarkers, markerType = 'all') {
        if (imageCoordinateMarkers && imageCoordinateMarkers.length > 0) {
            const markersToRemove = imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return true;
                return markerInfo.type === markerType;
            });

            markersToRemove.forEach(markerInfo => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(markerInfo.marker);
                }
            });

            return imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return false;
                return markerInfo.type !== markerType;
            });
        }
        return [];
    }

    // 画像境界の変更に応じてマーカー位置を更新
    updateMarkersForImageBounds(imageCoordinateMarkers) {
        try {
            if (!imageCoordinateMarkers || imageCoordinateMarkers.length === 0) {
                return;
            }

            const georefMarkers = imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );


            georefMarkers.forEach((markerInfo, index) => {
                const marker = markerInfo.marker;
                const data = markerInfo.data;

                if (data && data.imageX !== undefined && data.imageY !== undefined) {
                    // 現在の画像境界に基づいて位置を再計算
                    const newLatLng = this.convertImageToLatLng(data.imageX, data.imageY);
                    const oldPos = marker.getLatLng();
                    
                    this.logger.debug(`マーカー${index}: 画像境界更新 [${oldPos.lat.toFixed(6)}, ${oldPos.lng.toFixed(6)}] → [${newLatLng[0].toFixed(6)}, ${newLatLng[1].toFixed(6)}]`);
                    
                    marker.setLatLng(newLatLng);
                }
            });


        } catch (error) {
            this.logger.error('画像境界変更対応エラー', error);
        }
    }
}