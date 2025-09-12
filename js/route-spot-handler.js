// ルート・スポット処理機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { coordinateTransforms } from './coordinate-transforms.js';

export class RouteSpotHandler {
    constructor(mapCore, imageOverlay = null) {
        this.logger = new Logger('RouteSpotHandler');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.routeData = [];
        this.spotData = [];
        this.routeMarkers = [];
        this.spotMarkers = [];
    }

    async handleRouteSpotJsonLoad(files, selectedRouteSpotType) {
        try {
            if (!files.length) return;

            this.logger.info(`ルート・スポット(座標)JSONファイル読み込み開始: ${files.length}ファイル`);
            
            const routeData = [];
            const spotData = [];
            
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    // JSONファイルの内容を自動判定
                    const detectedType = this.detectJsonType(data);
                    
                    if (detectedType === 'route') {
                        const processedRoutes = this.processRouteData(data, file.name);
                        routeData.push(...processedRoutes);
                    } else if (detectedType === 'spot') {
                        const processedSpots = this.processSpotData(data, file.name);
                        spotData.push(...processedSpots);
                    } else if (detectedType === 'point') {
                        this.logger.warn(`ポイントデータは現在サポートされていません: ${file.name}`);
                        continue;
                    } else {
                        this.logger.warn(`ファイル形式を判定できませんでした: ${file.name}`);
                        continue;
                    }
                    
                    this.logger.info(`ファイル読み込み完了: ${file.name} (${detectedType}として処理)`);
                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                }
            }
            
            // ルートデータのマージと表示
            if (routeData.length > 0) {
                this.routeData = this.mergeAndDeduplicate(this.routeData, routeData, 'route');
                if (this.mapCore && this.mapCore.getMap()) {
                    await this.displayRouteSpotOnMap(routeData, 'route');
                }
            }
            
            // スポットデータのマージと表示
            if (spotData.length > 0) {
                this.spotData = this.mergeAndDeduplicate(this.spotData, spotData, 'spot');
                if (this.mapCore && this.mapCore.getMap()) {
                    await this.displayRouteSpotOnMap(spotData, 'spot');
                }
            }
            
            this.logger.info(`ルート・スポット(座標)JSON読み込み完了: ルート${routeData.length}本、スポット${spotData.length}個追加`);
            
        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        }
    }

    detectJsonType(data) {
        try {
            // ルートの判定基準
            // - routeInfoオブジェクトがある
            // - routeInfoは、startPoint, endPoint属性を持つ
            // - pointsオブジェクトがある  
            // - pointsは、type属性(値="waypoint")を持ち、imageX, imageYの座標を持つ
            if (data.routeInfo && 
                data.routeInfo.startPoint && 
                data.routeInfo.endPoint && 
                data.points && 
                Array.isArray(data.points)) {
                
                // pointsの要素をチェック
                const hasWaypoints = data.points.some(point => 
                    point.type === 'waypoint' && 
                    (point.imageX !== undefined && point.imageY !== undefined)
                );
                
                if (hasWaypoints) {
                    return 'route';
                }
            }
            
            // スポットの判定基準
            // - spotsオブジェクトがある
            // - spotsは、name属性(値はブランクでない文字列)を持ち、imageX, imageYの座標を持つ
            if (data.spots && Array.isArray(data.spots)) {
                const hasValidSpots = data.spots.some(spot =>
                    spot.name && 
                    typeof spot.name === 'string' && 
                    spot.name.trim() !== '' &&
                    (spot.imageX !== undefined && spot.imageY !== undefined)
                );
                
                if (hasValidSpots) {
                    return 'spot';
                }
            }
            
            // 単一スポットの場合（データがspotsオブジェクトで包まれていない）
            if (data.name && 
                typeof data.name === 'string' && 
                data.name.trim() !== '' &&
                (data.imageX !== undefined && data.imageY !== undefined)) {
                return 'spot';
            }
            
            // ポイントの判定基準
            // - points配列が存在し、typeが"waypoint"でない要素がある
            if (data.points && Array.isArray(data.points)) {
                const hasNonWaypoints = data.points.some(point => 
                    point.type !== 'waypoint' && 
                    (point.id || point.name) &&
                    (point.imageX !== undefined && point.imageY !== undefined)
                );
                
                if (hasNonWaypoints) {
                    return 'point';
                }
            }
            
            this.logger.warn('判定不可能なファイルがありました。処理をスキップします。');
            return null;
            
        } catch (error) {
            return null;
        }
    }

    processRouteData(data, fileName) {
        const routes = [];
        
        try {
            const route = {
                ...data,
                fileName: fileName,
                routeId: data.id || fileName.replace('.json', ''),
                startPoint: this.extractStartPoint(data),
                endPoint: this.extractEndPoint(data)
            };
            
            this.outputRouteDebugInfo(route, data);
            routes.push(route);
            
        } catch (error) {
            this.logger.error(`ルートデータ処理エラー: ${fileName}`, error);
        }
        
        return routes;
    }

    outputRouteDebugInfo(route, originalData) {
        try {
            let startPointId = null;
            let endPointId = null;
            let intermediatePoints = 0;
            
            if (originalData.routeInfo && (originalData.routeInfo.startPoint || originalData.routeInfo.endPoint)) {
                startPointId = originalData.routeInfo.startPoint || 'なし';
                endPointId = originalData.routeInfo.endPoint || 'なし';
                intermediatePoints = originalData.routeInfo.waypointCount || 0;
            } else if (originalData.points && Array.isArray(originalData.points)) {
                const totalPoints = originalData.points.length;
                if (totalPoints > 0) {
                    const startPoint = originalData.points[0];
                    const endPoint = originalData.points[totalPoints - 1];
                    
                    startPointId = startPoint.id || startPoint.name || startPoint.pointId || 'なし';
                    endPointId = endPoint.id || endPoint.name || endPoint.pointId || 'なし';
                    intermediatePoints = Math.max(0, totalPoints - 2);
                }
            } else if (originalData.coordinates && Array.isArray(originalData.coordinates)) {
                const totalPoints = originalData.coordinates.length;
                intermediatePoints = Math.max(0, totalPoints - 2);
                startPointId = '座標のみ';
                endPointId = '座標のみ';
            } else if (originalData.geometry && originalData.geometry.coordinates) {
                const totalPoints = originalData.geometry.coordinates.length;
                intermediatePoints = Math.max(0, totalPoints - 2);
                startPointId = 'GeoJSON';
                endPointId = 'GeoJSON';
            }
            
            
            
        } catch (error) {
        }
    }

    processSpotData(data, fileName) {
        const spots = [];
        
        try {
            
            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    const spot = {
                        ...item,
                        fileName: fileName,
                        spotId: item.id || item.name || `${fileName}_spot_${index}`,
                        coordinates: this.extractCoordinates(item)
                    };
                    
                    spots.push(spot);
                });
            } else if (data && typeof data === 'object') {
                if (data.spots && Array.isArray(data.spots)) {
                    data.spots.forEach((spotItem, index) => {
                        const spot = {
                            ...spotItem,
                            fileName: fileName,
                            spotId: spotItem.id || spotItem.name || `${fileName}_spot_${index}`,
                            coordinates: this.extractCoordinates(spotItem)
                        };
                        
                        spots.push(spot);
                    });
                } else if (data.features && Array.isArray(data.features)) {
                    data.features.forEach((feature, index) => {
                        const coords = feature.geometry && feature.geometry.coordinates;
                        const spot = {
                            ...feature.properties,
                            fileName: fileName,
                            spotId: feature.properties?.id || feature.properties?.name || `${fileName}_spot_${index}`,
                            coordinates: coords ? { lat: coords[1], lng: coords[0] } : this.extractCoordinates(feature.properties)
                        };
                        
                        spots.push(spot);
                    });
                } else {
                    const spot = {
                        ...data,
                        fileName: fileName,
                        spotId: data.id || data.name || `${fileName}_spot_0`,
                        coordinates: this.extractCoordinates(data)
                    };
                    
                    spots.push(spot);
                }
            }
            
            
        } catch (error) {
            this.logger.error(`スポットデータ処理エラー: ${fileName}`, error);
        }
        
        return spots;
    }

    extractStartPoint(route) {
        if (route.routeInfo && route.routeInfo.startPoint) {
            return {
                lat: null,
                lng: null,
                name: route.routeInfo.startPoint,
                id: route.routeInfo.startPoint
            };
        }
        
        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const firstPoint = route.points[0];
            return {
                lat: firstPoint.lat || firstPoint.latitude,
                lng: firstPoint.lng || firstPoint.longitude,
                name: firstPoint.name || firstPoint.id || firstPoint.pointId || 'Start',
                id: firstPoint.id || firstPoint.name || firstPoint.pointId || null
            };
        }
        
        if (route.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
            const firstCoord = route.coordinates[0];
            if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                return {
                    lat: firstCoord[0],
                    lng: firstCoord[1],
                    name: 'Start',
                    id: '座標のみ'
                };
            }
        }
        
        if (route.geometry && route.geometry.coordinates && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length > 0) {
            const firstCoord = route.geometry.coordinates[0];
            if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                return {
                    lat: firstCoord[1],
                    lng: firstCoord[0],
                    name: 'Start',
                    id: 'GeoJSON'
                };
            }
        }
        
        return null;
    }

    extractEndPoint(route) {
        if (route.routeInfo && route.routeInfo.endPoint) {
            return {
                lat: null,
                lng: null,
                name: route.routeInfo.endPoint,
                id: route.routeInfo.endPoint
            };
        }
        
        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const lastPoint = route.points[route.points.length - 1];
            return {
                lat: lastPoint.lat || lastPoint.latitude,
                lng: lastPoint.lng || lastPoint.longitude,
                name: lastPoint.name || lastPoint.id || lastPoint.pointId || 'End',
                id: lastPoint.id || lastPoint.name || lastPoint.pointId || null
            };
        }
        
        if (route.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
            const lastCoord = route.coordinates[route.coordinates.length - 1];
            if (Array.isArray(lastCoord) && lastCoord.length >= 2) {
                return {
                    lat: lastCoord[0],
                    lng: lastCoord[1],
                    name: 'End',
                    id: '座標のみ'
                };
            }
        }
        
        if (route.geometry && route.geometry.coordinates && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length > 0) {
            const lastCoord = route.geometry.coordinates[route.geometry.coordinates.length - 1];
            if (Array.isArray(lastCoord) && lastCoord.length >= 2) {
                return {
                    lat: lastCoord[1],
                    lng: lastCoord[0],
                    name: 'End',
                    id: 'GeoJSON'
                };
            }
        }
        
        return null;
    }

    extractCoordinates(spot) {
        if (spot.lat && spot.lng) {
            return { lat: spot.lat, lng: spot.lng };
        } else if (spot.latitude && spot.longitude) {
            return { lat: spot.latitude, lng: spot.longitude };
        } else if (spot.coordinates && Array.isArray(spot.coordinates)) {
            return { lat: spot.coordinates[1], lng: spot.coordinates[0] };
        } else if (spot.geometry && spot.geometry.coordinates) {
            const coords = spot.geometry.coordinates;
            return { lat: coords[1], lng: coords[0] };
        } else if (spot.imageX !== undefined && spot.imageY !== undefined && this.imageOverlay) {
            // 画像座標からGPS座標に変換
            return this.convertImageCoordsToGps(spot.imageX, spot.imageY);
        }
        
        return null;
    }

    convertImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) {
                return null;
            }

            const result = coordinateTransforms.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            return result ? { lat: result[0], lng: result[1] } : null;
            
        } catch (error) {
            return null;
        }
    }

    mergeAndDeduplicate(existingData, newData, type) {
        const merged = [...existingData];
        let addedCount = 0;
        let updatedCount = 0;
        
        newData.forEach(newItem => {
            let duplicateIndex = -1;
            
            if (type === 'route') {
                duplicateIndex = merged.findIndex(existing => 
                    this.isSameRoute(existing, newItem)
                );
            } else if (type === 'spot') {
                duplicateIndex = merged.findIndex(existing => 
                    this.isSameSpot(existing, newItem)
                );
            }
            
            if (duplicateIndex === -1) {
                // 新規追加
                merged.push(newItem);
                addedCount++;
            } else {
                // 既存ルート/スポットを新しいデータで更新
                if (type === 'spot') {
                    // スポットの場合は名前やその他の属性を更新
                    const existingSpot = merged[duplicateIndex];
                    const updatedSpot = {
                        ...existingSpot,
                        ...newItem,
                        // 座標情報は既存のものを保持（変更しない）
                        coordinates: existingSpot.coordinates
                    };
                    merged[duplicateIndex] = updatedSpot;
                } else {
                    // ルートの場合は全体を置き換え
                    merged[duplicateIndex] = newItem;
                }
                updatedCount++;
                this.logger.debug(`${type}を更新: ${newItem.fileName}`);
            }
        });
        
        // 総数を出力
        if (type === 'route') {
        } else if (type === 'spot') {
        }
        
        return merged;
    }

    isSameRoute(route1, route2) {
        const start1 = route1.startPoint;
        const end1 = route1.endPoint;
        const start2 = route2.startPoint;
        const end2 = route2.endPoint;
        
        // 座標データがない場合はIDで比較
        if (!start1 || !end1 || !start2 || !end2) {
            return false;
        }
        
        // ID比較も追加（座標だけでなくIDも考慮）
        const start1Id = start1.id || start1.name;
        const end1Id = end1.id || end1.name;
        const start2Id = start2.id || start2.name;
        const end2Id = end2.id || end2.name;
        
        // IDによる比較
        if (start1Id && end1Id && start2Id && end2Id) {
            // 正方向の比較（開始ID→終了IDが同じ）
            const sameDirectionById = (start1Id === start2Id && end1Id === end2Id);
            
            // 逆方向の比較（開始ID→終了IDが逆）
            const reverseDirectionById = (start1Id === end2Id && end1Id === start2Id);
            
            
            return sameDirectionById || reverseDirectionById;
        }
        
        // 座標による比較
        const tolerance = 0.0001;
        
        if (start1.lat && start1.lng && end1.lat && end1.lng && 
            start2.lat && start2.lng && end2.lat && end2.lng) {
            
            // 正方向の比較（開始点→終了点が同じ）
            const sameDirection = (
                Math.abs(start1.lat - start2.lat) < tolerance &&
                Math.abs(start1.lng - start2.lng) < tolerance &&
                Math.abs(end1.lat - end2.lat) < tolerance &&
                Math.abs(end1.lng - end2.lng) < tolerance
            );
            
            // 逆方向の比較（開始点→終了点が逆）
            const reverseDirection = (
                Math.abs(start1.lat - end2.lat) < tolerance &&
                Math.abs(start1.lng - end2.lng) < tolerance &&
                Math.abs(end1.lat - start2.lat) < tolerance &&
                Math.abs(end1.lng - start2.lng) < tolerance
            );
            
            
            return sameDirection || reverseDirection;
        }
        
        return false;
    }

    isSameSpot(spot1, spot2) {
        // imageX, imageYが両方ある場合はそれで比較（優先）
        if (spot1.imageX !== undefined && spot1.imageY !== undefined && 
            spot2.imageX !== undefined && spot2.imageY !== undefined) {
            
            const imageXMatch = Math.abs(spot1.imageX - spot2.imageX) < 0.1;
            const imageYMatch = Math.abs(spot1.imageY - spot2.imageY) < 0.1;
            
            
            return imageXMatch && imageYMatch;
        }
        
        // GPS座標で比較
        const coord1 = spot1.coordinates;
        const coord2 = spot2.coordinates;
        
        if (!coord1 || !coord2) {
            return false;
        }
        
        const tolerance = 0.0001;
        const latMatch = Math.abs(coord1.lat - coord2.lat) < tolerance;
        const lngMatch = Math.abs(coord1.lng - coord2.lng) < tolerance;
        
        
        return latMatch && lngMatch;
    }

    async displayRouteSpotOnMap(data, type) {
        try {
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error('地図が初期化されていません。');
            }

            this.logger.info(`${type}データの地図表示開始`, data.length + '項目');
            this.logger.debug(`データ詳細:`, data);

            let displayCount = 0;

            data.forEach((item, index) => {
                this.logger.debug(`処理中: ${type}[${index}]`, item);

                if (type === 'route') {
                    let latLngs = [];
                    let points = [];
                    
                    if (item.points && Array.isArray(item.points)) {
                        points = item.points
                            .map((point, index) => {
                                const coords = this.extractCoordinates(point);
                                if (coords) {
                                    return {
                                        lat: coords.lat,
                                        lng: coords.lng,
                                        name: point.name || point.id || point.pointId || `Point-${index + 1}`,
                                        type: point.type || 'waypoint',
                                        // 元データの出自（画像座標 or GPS）を保持
                                        __origin: (point.imageX !== undefined && point.imageY !== undefined) ? 'image' : 'gps',
                                        __imageX: point.imageX,
                                        __imageY: point.imageY
                                    };
                                } else {
                                    return null;
                                }
                            })
                            .filter(p => p !== null);
                        latLngs = points.map(p => [p.lat, p.lng]);
                    } else if (item.coordinates && Array.isArray(item.coordinates)) {
                        latLngs = item.coordinates.map(coord => [coord[1], coord[0]]);
                        points = item.coordinates.map((coord, idx) => ({
                            lat: coord[1], 
                            lng: coord[0], 
                            name: `Point-${idx + 1}`,
                            type: 'waypoint'
                        }));
                    } else if (item.geometry && item.geometry.coordinates) {
                        latLngs = item.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                        points = item.geometry.coordinates.map((coord, idx) => ({
                            lat: coord[1], 
                            lng: coord[0], 
                            name: `Point-${idx + 1}`,
                            type: 'waypoint'
                        }));
                    }
                    
                    this.logger.debug(`ルート座標数: ${latLngs.length}`, latLngs);
                    
                    if (latLngs.length > 1) {
                        const polyline = L.polyline(latLngs, {
                            color: '#ff6600',
                            weight: 3,
                            opacity: 0.8
                        }, { pane: 'routeLines' }).addTo(this.mapCore.getMap());
                        
                        const routeInfo = `
                            <div>
                                <strong>ルート: ${item.name || item.routeId}</strong><br>
                                ファイル: ${item.fileName}<br>
                                ポイント数: ${latLngs.length}
                            </div>
                        `;
                        polyline.bindPopup(routeInfo);
                        
                        points.forEach((point, pointIndex) => {
                            let uiType = 'waypoint';
                            let label = '中間点';
                            if (pointIndex === 0) {
                                uiType = 'route-start';
                                label = '開始点';
                            } else if (pointIndex === points.length - 1) {
                                uiType = 'route-end';
                                label = '終了点';
                            }


                            let marker;
                            if (uiType === 'waypoint' || point.type === 'waypoint') {
                                const diamondIcon = L.divIcon({
                                    className: 'diamond-marker',
                                    html: '<div style="width: 8px; height: 8px; background-color: #ffa500; transform: rotate(45deg);"></div>',
                                    iconSize: [8, 8],
                                    iconAnchor: [4, 4]
                                });
                                marker = L.marker([point.lat, point.lng], { icon: diamondIcon, pane: 'wayPointMarkers' }).addTo(this.mapCore.getMap());
                            } else if (uiType === 'route-start') {
                                marker = L.circleMarker([point.lat, point.lng], {
                                    radius: 7,
                                    color: '#00cc00',
                                    fillColor: '#00cc00',
                                    fillOpacity: 0.9,
                                    weight: 2,
                                    pane: 'pointJsonMarkers'
                                }).addTo(this.mapCore.getMap());
                            } else if (uiType === 'route-end') {
                                marker = L.circleMarker([point.lat, point.lng], {
                                    radius: 7,
                                    color: '#cc0000',
                                    fillColor: '#cc0000',
                                    fillOpacity: 0.9,
                                    weight: 2,
                                    pane: 'pointJsonMarkers'
                                }).addTo(this.mapCore.getMap());
                            }
                            
                            // マーカーに元座標系メタを付与
                            if (marker) {
                                marker.__meta = {
                                    origin: point.__origin || 'gps',
                                    imageX: point.__imageX,
                                    imageY: point.__imageY,
                                    routeId: item.name || item.routeId,
                                    label: label
                                };
                            }

                            const pointInfo = `
                                <div>
                                    <strong>${label}: ${point.name || point.id || pointIndex + 1}</strong><br>
                                    ルート: ${item.name || item.routeId}<br>
                                    座標: (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})
                                </div>
                            `;
                            marker.bindPopup(pointInfo);
                            
                            if (!this.routeMarkers) this.routeMarkers = [];
                            this.routeMarkers.push(marker);
                        });
                        
                        if (!this.routeMarkers) this.routeMarkers = [];
                        // ポリラインにも各頂点の元座標系メタを付与
                        polyline.__meta = {
                            points: points.map(p => ({
                                origin: p.__origin || 'gps',
                                imageX: p.__imageX,
                                imageY: p.__imageY
                            })),
                            routeId: item.name || item.routeId
                        };
                        this.routeMarkers.push(polyline);
                        displayCount++;
                    }
                } else if (type === 'spot') {
                    let latLng = null;
                    
                    if (item.coordinates && typeof item.coordinates === 'object') {
                        if (item.coordinates.lat && item.coordinates.lng) {
                            latLng = [item.coordinates.lat, item.coordinates.lng];
                        } else if (Array.isArray(item.coordinates)) {
                            latLng = [item.coordinates[1], item.coordinates[0]];
                        }
                    } else if (item.lat && item.lng) {
                        latLng = [item.lat, item.lng];
                    } else if (item.geometry && item.geometry.coordinates) {
                        const coords = item.geometry.coordinates;
                        latLng = [coords[1], coords[0]];
                    }
                    
                    this.logger.debug(`スポット座標:`, latLng);
                    
                    if (latLng && latLng[0] && latLng[1]) {
                        const squareIcon = L.divIcon({
                            className: 'square-spot-marker',
                            html: '<div style="width: 10px; height: 10px; background-color: #0066ff; border: 1px solid #004499;"></div>',
                            iconSize: [10, 10],
                            iconAnchor: [5, 5]
                        });
                        const marker = L.marker(latLng, { 
                            icon: squareIcon, 
                            pane: 'pointJsonMarkers' 
                        }).addTo(this.mapCore.getMap());
                        
                        const spotInfo = `
                            <div>
                                <strong>スポット: ${item.name || item.spotId}</strong><br>
                                ファイル: ${item.fileName}<br>
                                座標: (${latLng[0].toFixed(6)}, ${latLng[1].toFixed(6)})
                            </div>
                        `;
                        marker.bindPopup(spotInfo);
                        
                        // スポットにも元座標系メタを付与
                        const origin = (item.imageX !== undefined && item.imageY !== undefined) ? 'image' : 'gps';
                        marker.__meta = {
                            origin: origin,
                            imageX: item.imageX,
                            imageY: item.imageY,
                            spotId: item.name || item.spotId
                        };

                        if (!this.spotMarkers) this.spotMarkers = [];
                        this.spotMarkers.push(marker);
                        displayCount++;
                    }
                }
            });

            this.logger.info(`${type}データの地図表示完了: ${displayCount}/${data.length}項目表示`);
            
        } catch (error) {
            this.logger.error('ルート・スポット地図表示エラー', error);
            throw error;
        }
    }

    getRouteCount() {
        return Array.isArray(this.routeData) ? this.routeData.length : 0;
    }

    getSpotCount() {
        return Array.isArray(this.spotData) ? this.spotData.length : 0;
    }
}