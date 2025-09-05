// 画像オーバーレイ機能を管理するモジュール
import { DEFAULTS } from './constants.js';

export class ImageOverlay {
    constructor(mapCore) {
        this.map = mapCore.getMap();
        this.mapCore = mapCore;
        this.imageOverlay = null;
        this.currentImage = new Image();
        this.currentImageFileName = null;
        this.centerMarker = null;
        this.dragHandles = [];
        this.isDragging = false;
        this.dragCornerIndex = -1;
        this.resizeTooltip = null;
        this.isMovingImage = false;
        this.moveStartPoint = null;
        this.isCenteringMode = false;
        this.imageUpdateCallbacks = [];
        
        // 内部scale管理（初期値はconstantsから取得）
        this.currentScale = this.getDefaultScale();
        
        // 初期スケール値を設定
        this.initializeScaleInput();
        
        // 初期透過度を取得してUIに設定
        this.initializeOpacityInput();
        
        // 中心マーカーは画像読み込み後に表示するため、初期化のみ行う
        this.initializeCenterMarker(mapCore.getInitialCenter(), false);
        this.setupEventHandlers();
    }

    // 初期スケール値を設定（UIフィールドは削除済み）
    initializeScaleInput() {
        // scaleInputフィールドは削除されたため、内部scaleのみ初期化
        this.currentScale = this.getDefaultScale();
    }

    // 初期透過度を取得してUIに設定
    initializeOpacityInput() {
        const opacityInput = document.getElementById('opacityInput');
        if (opacityInput) {
            const defaultOpacity = this.getDefaultOpacity();
            opacityInput.value = defaultOpacity.toString();
        }
    }

    // デフォルトスケール値を取得
    getDefaultScale() {
        return DEFAULTS.IMAGE_OVERLAY_DEFAULT_SCALE;
    }

    // デフォルト透過度を取得
    getDefaultOpacity() {
        return DEFAULTS.IMAGE_OVERLAY_DEFAULT_OPACITY;
    }

    // 現在のscale値を取得
    getCurrentScale() {
        return this.currentScale || this.getDefaultScale();
    }

    // scale値を設定
    setCurrentScale(scale) {
        this.currentScale = scale;
        // scaleInputフィールドは削除されたため、内部scaleのみ更新
    }

    initializeCenterMarker(position, addToMap = true) {
        const centerIcon = L.divIcon({
            className: 'center-marker-icon',
            html: '<div style="width: 8px; height: 8px; background-color: #00bfff; border: 1.5px solid #ffffff;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        
        this.centerMarker = this.createCenterMarker(position, centerIcon, addToMap);
    }

    createCenterMarker(position, icon, addToMap = true) {
        const marker = L.marker(position, { 
            icon: icon,
            draggable: false,
            pane: 'centerMarker'
        });
        
        if (addToMap) {
            marker.addTo(this.map);
        }
        
        marker.bindTooltip('ドラッグして画像移動', {
            permanent: false,
            direction: 'top',
            offset: [0, -10],
            className: 'center-marker-tooltip'
        });
        
        marker.on('mouseover', () => {
            if (!this.isMovingImage) {
                this.map.getContainer().style.cursor = 'move';
            }
        });
        
        marker.on('mouseout', () => {
            if (!this.isMovingImage) {
                this.map.getContainer().style.cursor = '';
                document.body.style.cursor = '';
            }
        });
        
        marker.on('mousedown', (e) => {
            if (!this.imageOverlay) return;
            
            this.isMovingImage = true;
            this.moveStartPoint = e.latlng;
            this.map.dragging.disable();
            this.map.getContainer().style.cursor = 'grabbing';
            
            const moveHandler = (moveEvent) => {
                if (!this.isMovingImage) return;
                
                const deltaLat = moveEvent.latlng.lat - this.moveStartPoint.lat;
                const deltaLng = moveEvent.latlng.lng - this.moveStartPoint.lng;
                
                this.moveImageToPosition([
                    this.centerMarker.getLatLng().lat + deltaLat,
                    this.centerMarker.getLatLng().lng + deltaLng
                ]);
                
                this.moveStartPoint = moveEvent.latlng;
            };
            
            const stopHandler = () => {
                this.isMovingImage = false;
                this.map.dragging.enable();
                this.map.getContainer().style.cursor = '';
                this.map.off('mousemove', moveHandler);
                this.map.off('mouseup', stopHandler);
            };
            
            this.map.on('mousemove', moveHandler);
            this.map.on('mouseup', stopHandler);
        });
        
        return marker;
    }

    moveImageToPosition(newPosition) {
        if (!this.imageOverlay) return;
        
        this.centerMarker.setLatLng(newPosition);
        this.updateImageDisplay();
    }

    removeDragHandles() {
        this.dragHandles.forEach(handle => {
            this.map.removeLayer(handle);
        });
        this.dragHandles = [];
    }

    createDragHandles(bounds) {
        this.removeDragHandles();
        
        const corners = [
            { pos: bounds.getNorthWest(), cursor: 'nw-resize', tooltip: '左上角をドラッグしてリサイズ' },
            { pos: bounds.getNorthEast(), cursor: 'ne-resize', tooltip: '右上角をドラッグしてリサイズ' },
            { pos: bounds.getSouthEast(), cursor: 'se-resize', tooltip: '右下角をドラッグしてリサイズ' },
            { pos: bounds.getSouthWest(), cursor: 'sw-resize', tooltip: '左下角をドラッグしてリサイズ' }
        ];
        
        corners.forEach((corner, index) => {
            const handleIcon = L.divIcon({
                className: 'drag-handle-icon',
                html: '<div class="drag-handle-pulse" style="width: 8px; height: 8px; background-color: #00bfff; border: 1.5px solid #ffffff;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            
            const handle = L.marker(corner.pos, { 
                icon: handleIcon,
                draggable: false,
                pane: 'dragHandles'
            }).addTo(this.map);
            
            handle.bindTooltip(corner.tooltip, {
                permanent: false,
                direction: 'top',
                offset: [0, -15],
                className: 'drag-handle-tooltip'
            });
            
            handle.on('mouseover', () => {
                this.map.getContainer().style.cursor = corner.cursor;
            });
            
            handle.on('mouseout', () => {
                if (!this.isDragging) {
                    this.map.getContainer().style.cursor = '';
                }
            });
            
            handle.on('mousedown', (e) => {
                this.isDragging = true;
                this.dragCornerIndex = index;
                this.map.dragging.disable();
                this.map.getContainer().style.cursor = corner.cursor;
                
                const moveHandler = (moveEvent) => {
                    if (this.isDragging && this.dragCornerIndex === index) {
                        this.updateImageBounds(moveEvent.latlng, index);
                    }
                };
                
                const stopHandler = () => {
                    this.isDragging = false;
                    this.dragCornerIndex = -1;
                    this.map.dragging.enable();
                    this.map.getContainer().style.cursor = '';
                    this.hideResizeInfo();
                    this.map.off('mousemove', moveHandler);
                    this.map.off('mouseup', stopHandler);
                };
                
                this.map.on('mousemove', moveHandler);
                this.map.on('mouseup', stopHandler);
            });
            
            this.dragHandles.push(handle);
        });
    }

    updateImageBounds(newCornerPos, cornerIndex) {
        if (!this.imageOverlay) return;
        
        const currentBounds = this.imageOverlay.getBounds();
        const oppositeIndex = (cornerIndex + 2) % 4;
        
        // 対角コーナーの位置を取得
        let oppositeCorner;
        if (cornerIndex === 0) { // 左上
            oppositeCorner = currentBounds.getSouthEast();
        } else if (cornerIndex === 1) { // 右上
            oppositeCorner = currentBounds.getSouthWest();
        } else if (cornerIndex === 2) { // 右下
            oppositeCorner = currentBounds.getNorthWest();
        } else { // 左下
            oppositeCorner = currentBounds.getNorthEast();
        }
        
        // 画像の元のアスペクト比
        const imageAspectRatio = this.currentImage.width / this.currentImage.height;
        
        // 新しいコーナー位置と対角コーナー間の距離を計算（メートル単位）
        const centerLat = (newCornerPos.lat + oppositeCorner.lat) / 2;
        const latDistance = this.map.distance(
            [newCornerPos.lat, centerLat],
            [oppositeCorner.lat, centerLat]
        );
        const lngDistance = this.map.distance(
            [centerLat, newCornerPos.lng],
            [centerLat, oppositeCorner.lng]
        );
        
        // アスペクト比を維持するために調整
        const currentAspectRatio = lngDistance / latDistance;
        
        let adjustedLatDistance, adjustedLngDistance;
        if (currentAspectRatio > imageAspectRatio) {
            // 幅が広すぎる場合、幅を調整
            adjustedLngDistance = latDistance * imageAspectRatio;
            adjustedLatDistance = latDistance;
        } else {
            // 高さが高すぎる場合、高さを調整
            adjustedLatDistance = lngDistance / imageAspectRatio;
            adjustedLngDistance = lngDistance;
        }
        
        // 距離を緯度・経度の差分に変換
        const earthRadius = 6378137; // 地球の半径（メートル）
        const latDelta = (adjustedLatDistance / earthRadius) * (180 / Math.PI);
        const lngDelta = (adjustedLngDistance / (earthRadius * Math.cos(centerLat * Math.PI / 180))) * (180 / Math.PI);
        
        // 各コーナーに応じて新しい境界を計算
        let newBounds;
        if (cornerIndex === 0) { // 左上ハンドル
            const south = oppositeCorner.lat;
            const east = oppositeCorner.lng;
            const north = south + latDelta;
            const west = east - lngDelta;
            newBounds = L.latLngBounds([south, west], [north, east]);
        } else if (cornerIndex === 1) { // 右上ハンドル
            const south = oppositeCorner.lat;
            const west = oppositeCorner.lng;
            const north = south + latDelta;
            const east = west + lngDelta;
            newBounds = L.latLngBounds([south, west], [north, east]);
        } else if (cornerIndex === 2) { // 右下ハンドル
            const north = oppositeCorner.lat;
            const west = oppositeCorner.lng;
            const south = north - latDelta;
            const east = west + lngDelta;
            newBounds = L.latLngBounds([south, west], [north, east]);
        } else { // 左下ハンドル
            const north = oppositeCorner.lat;
            const east = oppositeCorner.lng;
            const south = north - latDelta;
            const west = east - lngDelta;
            newBounds = L.latLngBounds([south, west], [north, east]);
        }
        
        // 境界が有効であることを確認
        if (newBounds.isValid()) {
            this.imageOverlay.setBounds(newBounds);
            
            const newCenter = newBounds.getCenter();
            this.centerMarker.setLatLng(newCenter);
            
            this.createDragHandles(newBounds);
            this.updateScaleFromBounds(newBounds);
            this.showResizeInfo(newBounds, newCenter);
            
            // 画像更新をコールバックに通知（JSONポイント位置更新のため）
            this.notifyImageUpdate();
        }
    }

    showResizeInfo(bounds, center) {
        this.hideResizeInfo();
        
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        
        const widthKm = this.map.distance(
            [center.lat, sw.lng],
            [center.lat, ne.lng]
        ) / 1000;
        const heightKm = this.map.distance(
            [sw.lat, center.lng],
            [ne.lat, center.lng]
        ) / 1000;
        
        this.resizeTooltip = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'resize-info-tooltip'
        })
        .setContent(`幅: ${widthKm.toFixed(2)}km<br>高さ: ${heightKm.toFixed(2)}km`)
        .setLatLng(center)
        .addTo(this.map);
    }

    hideResizeInfo() {
        if (this.resizeTooltip) {
            this.map.removeLayer(this.resizeTooltip);
            this.resizeTooltip = null;
        }
    }

    updateScaleFromBounds(bounds) {
        if (!this.currentImage.width) return;
        
        const latLngBounds = bounds;
        const pixelBounds = this.map.latLngToLayerPoint(latLngBounds.getNorthEast())
            .distanceTo(this.map.latLngToLayerPoint(latLngBounds.getSouthWest()));
        
        const imagePixels = Math.sqrt(this.currentImage.width * this.currentImage.width + 
                                     this.currentImage.height * this.currentImage.height);
        
        const newScale = pixelBounds / imagePixels;
        this.setCurrentScale(newScale);
    }


    getDisplayOpacity() {
        const opacityInput = document.getElementById('opacityInput');
        return opacityInput ? parseInt(opacityInput.value) / 100 : 0.5;
    }

    updateImageDisplay() {
        if (!this.imageOverlay || !this.currentImage.src) {
            return;
        }
        
        // 内部管理のscale値を使用
        const scale = this.getCurrentScale();
        
        const centerPos = this.centerMarker.getLatLng();
        
        // 中心座標の妥当性チェック
        if (!centerPos || !isFinite(centerPos.lat) || !isFinite(centerPos.lng)) {
            return;
        }
        
        // naturalWidth/naturalHeightを使用して正確なピクセル数を取得
        const imageWidth = this.currentImage.naturalWidth || this.currentImage.width;
        const imageHeight = this.currentImage.naturalHeight || this.currentImage.height;
        
        // 画像サイズの妥当性チェック
        if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
            return;
        }
        
        const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.map.getZoom());
        
        // metersPerPixelの妥当性チェック
        if (!isFinite(metersPerPixel) || metersPerPixel <= 0) {
            return;
        }
        
        const scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
        const scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
        
        const earthRadius = 6378137;
        const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
        const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * Math.cos(centerPos.lat * Math.PI / 180)) * (180 / Math.PI);
        
        // オフセット値の妥当性チェック
        if (!isFinite(latOffset) || !isFinite(lngOffset)) {
            return;
        }
        
        // 境界座標の計算と妥当性チェック
        const southWest = [centerPos.lat - latOffset, centerPos.lng - lngOffset];
        const northEast = [centerPos.lat + latOffset, centerPos.lng + lngOffset];
        
        if (!isFinite(southWest[0]) || !isFinite(southWest[1]) || !isFinite(northEast[0]) || !isFinite(northEast[1])) {
            return;
        }
        
        const bounds = L.latLngBounds(southWest, northEast);
        
        // 画像レイヤーの境界を更新
        this.imageOverlay.setBounds(bounds);
        
        // 画像レイヤーが地図に追加されていない場合は再追加
        if (!this.map.hasLayer(this.imageOverlay)) {
            this.imageOverlay.addTo(this.map);
        }
        
        // 強制的に画像レイヤーを再描画
        if (this.imageOverlay._image) {
            // ImageOverlayにはredrawメソッドがないため、代替手段を使用
            if (typeof this.imageOverlay._reset === 'function') {
                this.imageOverlay._reset();
            } else {
                // _resetが存在しない場合は、画像の透明度を一時的に変更して強制更新
                const currentOpacity = this.imageOverlay.options.opacity;
                this.imageOverlay.setOpacity(currentOpacity === 1 ? 0.99 : 1);
                setTimeout(() => {
                    this.imageOverlay.setOpacity(currentOpacity);
                }, 10);
            }
        }
        
        // 短時間後に地図の強制更新（レンダリングの遅延対策）
        setTimeout(() => {
            this.map.invalidateSize();
        }, 50);
        
        this.createDragHandles(bounds);
        
        // 画像更新をコールバックに通知
        this.notifyImageUpdate();
    }

    updateOpacity() {
        if (this.imageOverlay) {
            this.imageOverlay.setOpacity(this.getDisplayOpacity());
        }
    }

    setupEventHandlers() {
        const opacityInput = document.getElementById('opacityInput');
        
        // scaleInputフィールドは削除済み
        
        if (opacityInput) {
            opacityInput.addEventListener('input', () => this.updateOpacity());
        }
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                this.currentImage.onload = () => {
                    if (this.imageOverlay) {
                        this.map.removeLayer(this.imageOverlay);
                        this.removeDragHandles();
                    }
                    
                    // 画像をウインドウの中心に配置
                    const mapCenter = this.map.getCenter();
                    this.centerMarker.setLatLng(mapCenter);
                    
                    // 中心マーカーを地図に追加（初回のみ）
                    if (!this.map.hasLayer(this.centerMarker)) {
                        this.centerMarker.addTo(this.map);
                    }
                    
                    this.imageOverlay = L.imageOverlay(e.target.result, this.getInitialBounds(), {
                        opacity: this.getDisplayOpacity(),
                        interactive: false
                    }).addTo(this.map);
                    
                    // ファイル名を記録
                    this.currentImageFileName = file.name;
                    
                    // 画像レイヤーが完全に読み込まれるまで少し待つ
                    setTimeout(() => {
                        this.updateImageDisplay();
                        resolve();
                    }, 100);
                };
                
                this.currentImage.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                this.currentImage.src = e.target.result;
            };
            
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    // 現在読み込まれている画像の情報を取得
    getCurrentImageInfo() {
        return {
            fileName: this.currentImageFileName,
            isLoaded: this.imageOverlay !== null
        };
    }

    // 画像更新時のコールバックを登録
    addImageUpdateCallback(callback) {
        this.imageUpdateCallbacks.push(callback);
    }

    // 画像更新時のコールバックを実行
    notifyImageUpdate() {
        this.imageUpdateCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
            }
        });
    }

    // 中心位置を設定（プログラマティック）
    setCenterPosition(latLng) {
        if (this.centerMarker) {
            this.centerMarker.setLatLng(latLng);
            // 画像表示を更新
            if (this.imageOverlay) {
                this.updateImageDisplay();
            }
        }
    }

    getInitialBounds() {
        const center = this.centerMarker.getLatLng();
        const offset = 0.001;
        return L.latLngBounds(
            [center.lat - offset, center.lng - offset],
            [center.lat + offset, center.lng + offset]
        );
    }
}