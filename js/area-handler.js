import { Logger } from './utils.js';
import { mathUtils } from './math-utils.js';

export class AreaHandler {
    constructor(mapCore, imageOverlay = null) {
        this.logger = new Logger('AreaHandler');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.areas = [];
        this.areaPolygons = [];
        this.currentTransformation = null;
    }

    // Set ImageOverlay instance
    setImageOverlay(imageOverlay) {
        this.imageOverlay = imageOverlay;
    }

    // Load areas from Firebase data
    async loadFromFirebaseData(areas, imageOverlay) {
        try {
            if (imageOverlay) {
                this.imageOverlay = imageOverlay;
            }

            this.logger.info(`Loading areas from Firebase: ${areas.length} items`);
            this.clearAreaLayers();

            this.areas = areas.map((area, index) => {
                // Ensure vertices exist
                if (!area.vertices || !Array.isArray(area.vertices)) {
                    this.logger.warn(`Area ${index} has no vertices, skipping.`);
                    return null;
                }
                return {
                    ...area,
                    id: area.id || area.firestoreId || `area_${index}`,
                    name: area.name || `Area ${index + 1}`
                };
            }).filter(a => a !== null);

            await this.displayAreasOnMap();

        } catch (error) {
            this.logger.error('Error loading areas from Firebase', error);
        }
    }

    // Display areas on map
    async displayAreasOnMap() {
        try {
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error('Map not initialized');
            }

            this.clearAreaLayers();

            this.areas.forEach((area, index) => {
                const latLngs = this.calculateAreaLatLngs(area);

                if (latLngs.length > 0) {
                    const polygon = L.polygon(latLngs, {
                        color: 'pink',
                        fillColor: 'pink',
                        fillOpacity: 0.3,
                        weight: 2
                    }).addTo(this.mapCore.getMap());

                    // Store metadata for sync
                    polygon.__meta = {
                        origin: 'firebase', // Areas currently only come from Firebase/Image coords usually
                        vertices: area.vertices, // Store original image coordinates {x, y}
                        areaId: area.id,
                        name: area.name
                    };

                    polygon.bindPopup(area.name);
                    this.areaPolygons.push(polygon);
                }
            });

            this.logger.info(`Displayed ${this.areaPolygons.length} areas on map`);

        } catch (error) {
            this.logger.error('Error displaying areas', error);
        }
    }

    // Calculate LatLngs for an area based on current state (Georeferenced or Image Bounds)
    calculateAreaLatLngs(area) {
        if (!area.vertices) return [];

        return area.vertices.map(v => {
            // v should be {x, y} (image coordinates)
            if (this.currentTransformation) {
                // Use Affine Transformation
                return this.transformImageCoordsToGps(v.x, v.y);
            } else {
                // Use Image Bounds (Fallback)
                return this.convertImageCoordsToGps(v.x, v.y);
            }
        }).filter(p => p !== null);
    }

    // Sync area positions (called when georeferencing updates)
    syncAreaPositions(transformation) {
        try {
            this.currentTransformation = transformation;

            if (!this.areaPolygons) return;

            this.areaPolygons.forEach(polygon => {
                const meta = polygon.__meta;
                if (!meta || !meta.vertices) return;

                const newLatLngs = meta.vertices.map(v => {
                    if (this.currentTransformation) {
                        return this.transformImageCoordsToGps(v.x, v.y);
                    } else {
                        return this.convertImageCoordsToGps(v.x, v.y);
                    }
                }).filter(p => p !== null);

                if (newLatLngs.length > 0) {
                    polygon.setLatLngs(newLatLngs);
                }
            });

            this.logger.info(`Synced ${this.areaPolygons.length} areas`);

        } catch (error) {
            this.logger.error('Error syncing area positions', error);
        }
    }

    // Helper: Convert Image Coords to GPS using Image Bounds
    convertImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) return null;

            const result = mathUtils.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            return result ? [result[0], result[1]] : null;
        } catch (error) {
            return null;
        }
    }

    // Helper: Transform Image Coords to GPS using Affine Transformation
    transformImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.currentTransformation) return null;

            // Using mathUtils (assuming it has applyAffineTransform same as in georeferencing.js usage)
            const result = mathUtils.applyAffineTransform(imageX, imageY, this.currentTransformation);
            return result;
        } catch (error) {
            return null;
        }
    }

    clearAreaLayers() {
        if (this.areaPolygons) {
            this.areaPolygons.forEach(p => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(p);
                }
            });
        }
        this.areaPolygons = [];
    }
}
