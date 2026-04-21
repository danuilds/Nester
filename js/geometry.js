/**
 * Geometry utilities for shapes and calculations
 */
class Geometry {
    static createRectangle(x, y, width, height) {
        return {
            type: 'rectangle',
            x: x,
            y: y,
            width: width,
            height: height,
            points: [
                { x: x, y: y },
                { x: x + width, y: y },
                { x: x + width, y: y + height },
                { x: x, y: y + height }
            ]
        };
    }

    static createCircle(x, y, radius) {
        return {
            type: 'circle',
            x: x,
            y: y,
            radius: radius,
            points: []
        };
    }

    static createPolygon(points) {
        return {
            type: 'polygon',
            points: points,
            x: null,
            y: null
        };
    }

    static getShapeBounds(shape) {
        if (shape.type === 'rectangle') {
            return {
                minX: shape.x,
                minY: shape.y,
                maxX: shape.x + shape.width,
                maxY: shape.y + shape.height,
                width: shape.width,
                height: shape.height
            };
        }

        if (shape.type === 'circle') {
            return {
                minX: shape.x - shape.radius,
                minY: shape.y - shape.radius,
                maxX: shape.x + shape.radius,
                maxY: shape.y + shape.radius,
                width: shape.radius * 2,
                height: shape.radius * 2
            };
        }

        if (shape.type === 'polygon' && shape.points.length > 0) {
            const xs = shape.points.map(p => p.x);
            const ys = shape.points.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            return {
                minX,
                minY,
                maxX,
                maxY,
                width: maxX - minX,
                height: maxY - minY
            };
        }

        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    static translateShape(shape, dx, dy) {
        if (shape.type === 'circle') {
            return {
                type: 'circle',
                x: shape.x + dx,
                y: shape.y + dy,
                radius: shape.radius,
                points: []
            };
        }

        if (shape.type === 'polygon') {
            return {
                type: 'polygon',
                points: (shape.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })),
                x: null,
                y: null
            };
        }

        if (shape.type === 'rectangle') {
            return {
                type: 'rectangle',
                x: shape.x + dx,
                y: shape.y + dy,
                width: shape.width,
                height: shape.height,
                points: shape.points ? shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })) : []
            };
        }

        return shape;
    }

    static rotateShape(shape, angle) {
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        if (shape.type === 'polygon') {
            const pivot = this.getShapeCenter(shape);
            const points = shape.points.map(p => {
                const px = p.x - pivot.x;
                const py = p.y - pivot.y;
                return {
                    x: px * cos - py * sin + pivot.x,
                    y: px * sin + py * cos + pivot.y
                };
            });
            return {
                type: 'polygon',
                points,
                x: null,
                y: null
            };
        } else if (shape.type === 'rectangle') {
            const corners = [
                { x: shape.x, y: shape.y },
                { x: shape.x + shape.width, y: shape.y },
                { x: shape.x + shape.width, y: shape.y + shape.height },
                { x: shape.x, y: shape.y + shape.height }
            ];
            const pivot = this.getShapeCenter(shape);
            const points = corners.map(p => {
                const px = p.x - pivot.x;
                const py = p.y - pivot.y;
                return {
                    x: px * cos - py * sin + pivot.x,
                    y: px * sin + py * cos + pivot.y
                };
            });
            return {
                type: 'polygon',
                points,
                x: null,
                y: null
            };
        } else if (shape.type === 'circle') {
            return {
                type: 'circle',
                x: shape.x,
                y: shape.y,
                radius: shape.radius,
                points: []
            };
        }

        return shape;
    }

    static normalizeShape(shape) {
        const bounds = this.getShapeBounds(shape);
        return this.translateShape(shape, -bounds.minX, -bounds.minY);
    }

    static getShapeCenter(shape) {
        const bounds = this.getShapeBounds(shape);
        return {
            x: bounds.minX + bounds.width / 2,
            y: bounds.minY + bounds.height / 2
        };
    }

    static checkCollision(shape1, shape2, padding = 0) {
        const bounds1 = this.getShapeBounds(shape1);
        const bounds2 = this.getShapeBounds(shape2);

        return !(
            bounds1.maxX + padding <= bounds2.minX ||
            bounds1.minX >= bounds2.maxX + padding ||
            bounds1.maxY + padding <= bounds2.minY ||
            bounds1.minY >= bounds2.maxY + padding
        );
    }

    static toPolygonPoints(shape, circleSegments = 28, maxPoints = 56) {
        if (shape.type === 'polygon') {
            return this.simplifyPolygonPoints(shape.points || [], maxPoints);
        }

        if (shape.type === 'rectangle') {
            return [
                { x: shape.x, y: shape.y },
                { x: shape.x + shape.width, y: shape.y },
                { x: shape.x + shape.width, y: shape.y + shape.height },
                { x: shape.x, y: shape.y + shape.height }
            ];
        }

        if (shape.type === 'circle') {
            const points = [];
            const step = (Math.PI * 2) / circleSegments;
            for (let i = 0; i < circleSegments; i++) {
                const a = i * step;
                points.push({
                    x: shape.x + Math.cos(a) * shape.radius,
                    y: shape.y + Math.sin(a) * shape.radius
                });
            }
            return points;
        }

        return [];
    }

    static simplifyPolygonPoints(points, maxPoints = 56) {
        if (!points || points.length <= maxPoints) {
            return points || [];
        }

        const step = points.length / maxPoints;
        const out = [];
        for (let i = 0; i < maxPoints; i++) {
            out.push(points[Math.floor(i * step)]);
        }
        return out;
    }

    static polygonsIntersect(pointsA, pointsB) {
        if (!pointsA || !pointsB || pointsA.length < 3 || pointsB.length < 3) {
            return false;
        }

        for (let i = 0; i < pointsA.length; i++) {
            const a1 = pointsA[i];
            const a2 = pointsA[(i + 1) % pointsA.length];
            for (let j = 0; j < pointsB.length; j++) {
                const b1 = pointsB[j];
                const b2 = pointsB[(j + 1) % pointsB.length];
                if (this.segmentsIntersect(a1, a2, b1, b2)) {
                    return true;
                }
            }
        }

        if (this.pointInPolygon(pointsA[0], pointsB)) return true;
        if (this.pointInPolygon(pointsB[0], pointsA)) return true;

        return false;
    }

    static polygonDistance(pointsA, pointsB) {
        if (this.polygonsIntersect(pointsA, pointsB)) {
            return 0;
        }

        let minDist = Infinity;

        for (let i = 0; i < pointsA.length; i++) {
            const a = pointsA[i];
            for (let j = 0; j < pointsB.length; j++) {
                const b1 = pointsB[j];
                const b2 = pointsB[(j + 1) % pointsB.length];
                minDist = Math.min(minDist, this.pointToSegmentDistance(a, b1, b2));
            }
        }

        for (let i = 0; i < pointsB.length; i++) {
            const b = pointsB[i];
            for (let j = 0; j < pointsA.length; j++) {
                const a1 = pointsA[j];
                const a2 = pointsA[(j + 1) % pointsA.length];
                minDist = Math.min(minDist, this.pointToSegmentDistance(b, a1, a2));
            }
        }

        return minDist;
    }

    static pointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersects = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    static segmentsIntersect(p1, p2, q1, q2) {
        const o1 = this.orientation(p1, p2, q1);
        const o2 = this.orientation(p1, p2, q2);
        const o3 = this.orientation(q1, q2, p1);
        const o4 = this.orientation(q1, q2, p2);

        if (o1 !== o2 && o3 !== o4) return true;

        if (o1 === 0 && this.onSegment(p1, q1, p2)) return true;
        if (o2 === 0 && this.onSegment(p1, q2, p2)) return true;
        if (o3 === 0 && this.onSegment(q1, p1, q2)) return true;
        if (o4 === 0 && this.onSegment(q1, p2, q2)) return true;

        return false;
    }

    static orientation(a, b, c) {
        const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        const eps = 1e-9;
        if (Math.abs(val) < eps) return 0;
        return val > 0 ? 1 : 2;
    }

    static onSegment(a, b, c) {
        return (
            b.x <= Math.max(a.x, c.x) + 1e-9 &&
            b.x + 1e-9 >= Math.min(a.x, c.x) &&
            b.y <= Math.max(a.y, c.y) + 1e-9 &&
            b.y + 1e-9 >= Math.min(a.y, c.y)
        );
    }

    static pointToSegmentDistance(p, a, b) {
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = p.x - a.x;
        const apy = p.y - a.y;
        const ab2 = abx * abx + aby * aby;

        if (ab2 < 1e-12) {
            return Math.hypot(p.x - a.x, p.y - a.y);
        }

        let t = (apx * abx + apy * aby) / ab2;
        t = Math.max(0, Math.min(1, t));
        const cx = a.x + abx * t;
        const cy = a.y + aby * t;
        return Math.hypot(p.x - cx, p.y - cy);
    }

    static isShapeInsideBounds(shape, minX, minY, maxX, maxY, margin = 0) {
        const bounds = this.getShapeBounds(shape);
        return (
            bounds.minX >= minX + margin &&
            bounds.maxX <= maxX - margin &&
            bounds.minY >= minY + margin &&
            bounds.maxY <= maxY - margin
        );
    }

    static calculateArea(shape) {
        if (shape.type === 'circle') {
            return Math.PI * shape.radius * shape.radius;
        }

        if (shape.type === 'rectangle') {
            return shape.width * shape.height;
        }

        if (shape.type === 'polygon') {
            return this.polygonArea(shape.points);
        }

        return 0;
    }

    static polygonArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area) / 2;
    }

    static centerShapeAtOrigin(shape) {
        const center = this.getShapeCenter(shape);
        return this.translateShape(shape, -center.x, -center.y);
    }

    static generateRotations(shape, numRotations) {
        if (shape.type === 'circle') {
            return [this.normalizeShape(shape)];
        }

        const total = Math.max(1, Math.floor(numRotations));
        const rotations = [];

        for (let i = 0; i < total; i++) {
            const angle = (360 / total) * i;
            const rotated = this.rotateShape(shape, angle);
            rotations.push(this.normalizeShape(rotated));
        }

        return rotations;
    }

    static distanceBetweenPoints(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    static pointInRectangle(point, rect) {
        return (
            point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height
        );
    }
}
