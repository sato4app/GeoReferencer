// UIイベントハンドリング機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';

export class UIHandlers {
    constructor() {
        this.logger = new Logger('UIHandlers');
    }

    updateGpsPointCount(gpsData) {
        try {
            const gpsPointCountField = document.getElementById('gpsPointCount');
            if (gpsPointCountField && gpsData) {
                const points = gpsData.getPoints();
                const count = points ? points.length : 0;
                gpsPointCountField.value = count;
                this.logger.debug(`GPS ポイント数更新: ${count}個`);
            }
        } catch (error) {
            this.logger.error('GPS ポイント数更新エラー', error);
        }
    }

    updatePointCoordCount(pointJsonData) {
        try {
            const pointCountField = document.getElementById('pointCount');
            if (pointCountField && pointJsonData) {
                let count = 0;
                
                if (pointJsonData.points && Array.isArray(pointJsonData.points)) {
                    count = pointJsonData.points.length;
                } else if (Array.isArray(pointJsonData)) {
                    count = pointJsonData.length;
                }
                
                pointCountField.value = count;
                this.logger.debug(`ポイント座標数更新: ${count}個`);
            }
        } catch (error) {
            this.logger.error('ポイント座標数更新エラー', error);
        }
    }

    updateRouteSpotCount(routeSpotHandler) {
        try {
            const routeCountField = document.getElementById('routeCount');
            const spotCountField = document.getElementById('spotCount');
            
            if (routeCountField) {
                const routeCount = routeSpotHandler.getRouteCount();
                routeCountField.value = routeCount;
                this.logger.debug(`ルート数更新: ${routeCount}本`);
            }
            
            if (spotCountField) {
                const spotCount = routeSpotHandler.getSpotCount();
                spotCountField.value = spotCount;
                this.logger.debug(`スポット数更新: ${spotCount}個`);
            }
            
        } catch (error) {
            this.logger.error('ルート・スポット数更新エラー', error);
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
                }
                unmatchedPointsField.value = displayText;
            }
            
            if (result.georeferenceCompleted) {
                this.logger.info('ジオリファレンス詳細結果', {
                    totalGpsPoints: result.totalPoints,
                    totalPointJsons: result.totalPointJsons || 0,
                    matchedPairs: result.matchedCount,
                    unmatchedPointJsonCount: result.unmatchedPoints ? result.unmatchedPoints.length : 0,
                    matchPercentage: result.totalPointJsons > 0 ? 
                        Math.round((result.matchedCount / result.totalPointJsons) * 100) : 0
                });
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

    validateAndConvertExcelData(rawData) {
        try {
            if (!rawData || rawData.length === 0) {
                throw new Error('Excelファイルが空です。');
            }

            const requiredColumns = ['ポイントID', '名称', '緯度', '経度'];
            const optionalColumns = ['標高', '備考'];
            const allColumns = [...requiredColumns, ...optionalColumns];

            const headerRow = rawData[0];
            if (!headerRow || headerRow.length === 0) {
                throw new Error('ヘッダー行が見つかりません。');
            }

            const columnIndexMap = {};
            for (const column of allColumns) {
                const index = headerRow.indexOf(column);
                if (index !== -1) {
                    columnIndexMap[column] = index;
                } else if (requiredColumns.includes(column)) {
                    throw new Error(`必須列「${column}」が見つかりません。`);
                }
            }

            this.logger.info('Excel列マッピング', columnIndexMap);

            const validatedData = [];
            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                const pointData = {};
                let isValidRow = true;

                for (const column of requiredColumns) {
                    const value = row[columnIndexMap[column]];
                    if (value === undefined || value === null || value === '') {
                        isValidRow = false;
                        break;
                    }
                    pointData[column] = value;
                }

                if (!isValidRow) continue;

                for (const column of optionalColumns) {
                    if (columnIndexMap[column] !== undefined) {
                        const value = row[columnIndexMap[column]];
                        if (value !== undefined && value !== null && value !== '') {
                            pointData[column] = value;
                        }
                    }
                }

                try {
                    const lat = parseFloat(pointData['緯度']);
                    const lng = parseFloat(pointData['経度']);
                    
                    if (isNaN(lat) || isNaN(lng)) {
                        this.logger.warn(`行${i + 1}: 緯度・経度が数値ではありません`);
                        continue;
                    }

                    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        this.logger.warn(`行${i + 1}: 緯度・経度の範囲が不正です`);
                        continue;
                    }

                    validatedData.push({
                        pointId: pointData['ポイントID'],
                        name: pointData['名称'],
                        lat: lat,
                        lng: lng,
                        elevation: pointData['標高'] || null,
                        description: pointData['備考'] || null
                    });

                } catch (error) {
                    this.logger.warn(`行${i + 1}: データ変換エラー`, error);
                    continue;
                }
            }

            this.logger.info(`Excel検証完了: ${validatedData.length}/${rawData.length - 1}行が有効`);
            return validatedData;

        } catch (error) {
            this.logger.error('Excel データ検証エラー', error);
            throw error;
        }
    }
}