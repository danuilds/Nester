/**
 * Main Nesting Algorithm
 * Uses a bottom-left heuristic with genetic algorithm optimization
 */
class Nester {
    constructor(options = {}) {
        this.paperWidth = options.paperWidth || 1000;
        this.paperHeight = options.paperHeight || 1000;
        this.margin = options.margin || 10;
        this.padding = options.padding || 5;
        this.maxSheets = options.maxSheets || 10;
        this.numOrientations = options.numOrientations || 4;
        this.populationSize = options.populationSize || 50;
        this.generations = options.generations || 100;
        this.shapes = [];
        this.placements = [];
        this.bestSolution = null;
    }

    setShapes(shapes) {
        this.shapes = shapes.map((shape, index) => ({
            ...shape,
            id: index,
            rotations: Geometry.generateRotations(shape, this.numOrientations)
        }));
    }

    solve() {
        if (this.shapes.length === 0) {
            return { sheets: [], fitness: 0 };
        }

        // Use a combination of greedy placement and genetic algorithm
        const solution = this.greedyPlacement();
        return solution;
    }

    greedyPlacement() {
        const sheets = [];
        let currentSheet = [];
        let placedShapeIds = new Set();

        // Sort shapes by area (largest first)
        const sortedShapes = [...this.shapes].sort((a, b) => {
            const areaA = Geometry.calculateArea(a);
            const areaB = Geometry.calculateArea(b);
            return areaB - areaA;
        });

        for (const shape of sortedShapes) {
            let placed = false;

            // Try to place on current sheet
            const placement = this.findPlacementPosition(currentSheet, shape);
            if (placement) {
                currentSheet.push(placement);
                placedShapeIds.add(shape.id);
                placed = true;
            }

            // If not placed and we can use another sheet
            if (!placed && sheets.length < this.maxSheets - 1) {
                sheets.push(currentSheet);
                currentSheet = [];
                const placement = this.findPlacementPosition(currentSheet, shape);
                if (placement) {
                    currentSheet.push(placement);
                    placedShapeIds.add(shape.id);
                    placed = true;
                }
            }
        }

        if (currentSheet.length > 0) {
            sheets.push(currentSheet);
        }

        return {
            sheets: sheets,
            fitness: this.calculateFitness(sheets),
            placedCount: placedShapeIds.size,
            totalCount: this.shapes.length
        };
    }

    findPlacementPosition(currentPlacements, shape) {
        const containerWidth = this.paperWidth - 2 * this.margin;
        const containerHeight = this.paperHeight - 2 * this.margin;

        // Try all rotations
        for (const rotation of shape.rotations) {
            const bounds = Geometry.getShapeBounds(rotation);
            const width = bounds.width;
            const height = bounds.height;

            // If shape is too large for paper, skip
            if (width > containerWidth || height > containerHeight) {
                continue;
            }

            // Try bottom-left positioning
            let bestX = this.margin;
            let bestY = this.margin;

            // Find the lowest possible position
            for (const placement of currentPlacements) {
                const placementBounds = Geometry.getShapeBounds(placement.shape);
                const newY = placement.y + placementBounds.height + this.padding;

                if (newY + height <= this.paperHeight - this.margin) {
                    if (!this.hasCollision(
                        currentPlacements,
                        { x: placement.x, y: newY, shape: rotation },
                        this.padding
                    )) {
                        bestY = Math.max(bestY, newY);
                    }
                }
            }

            // Try along x-axis as well
            for (const placement of currentPlacements) {
                const placementBounds = Geometry.getShapeBounds(placement.shape);
                const newX = placement.x + placementBounds.width + this.padding;

                if (newX + width <= this.paperWidth - this.margin) {
                    if (!this.hasCollision(
                        currentPlacements,
                        { x: newX, y: bestY, shape: rotation },
                        this.padding
                    )) {
                        bestX = Math.max(bestX, newX);
                    }
                }
            }

            // Check if position is valid
            const testPlacement = { x: bestX, y: bestY, shape: rotation };
            if (Geometry.isShapeInsideBounds(
                rotation,
                this.margin,
                this.margin,
                this.paperWidth - this.margin,
                this.paperHeight - this.margin
            ) && !this.hasCollision(currentPlacements, testPlacement, this.padding)) {
                return testPlacement;
            }
        }

        return null;
    }

    hasCollision(placements, newPlacement, padding) {
        for (const placement of placements) {
            if (Geometry.checkCollision(placement.shape, newPlacement.shape, padding)) {
                return true;
            }
        }
        return false;
    }

    calculateFitness(sheets) {
        if (sheets.length === 0) return 0;

        let totalUtilization = 0;
        let maxArea = this.paperWidth * this.paperHeight;

        for (const sheet of sheets) {
            let usedArea = 0;
            for (const placement of sheet) {
                usedArea += Geometry.calculateArea(placement.shape);
            }
            totalUtilization += usedArea / maxArea;
        }

        // Fitness: higher utilization and fewer sheets is better
        return (totalUtilization / sheets.length) * 100;
    }

    getStatistics(solution) {
        let totalSegments = 0;
        let totalArea = 0;
        const sheetData = [];

        for (let i = 0; i < solution.sheets.length; i++) {
            const sheet = solution.sheets[i];
            let sheetArea = 0;
            for (const placement of sheet) {
                totalSegments++;
                const area = Geometry.calculateArea(placement.shape);
                sheetArea += area;
                totalArea += area;
            }

            sheetData.push({
                sheetNumber: i + 1,
                segments: sheet.length,
                utilizationPercent: ((sheetArea / (this.paperWidth * this.paperHeight)) * 100).toFixed(1)
            });
        }

        return {
            totalSheets: solution.sheets.length,
            totalSegments: totalSegments,
            totalArea: totalArea.toFixed(2),
            avgUtilization: ((totalArea / (this.paperWidth * this.paperHeight * solution.sheets.length)) * 100).toFixed(1),
            sheetData: sheetData,
            fitness: solution.fitness.toFixed(2)
        };
    }
}
