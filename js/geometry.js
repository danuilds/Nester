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
        } else if (shape.type === 'circle') {
            return {
                minX: shape.x - shape.radius,
                minY: shape.y - shape.radius,
                maxX: shape.x + shape.radius,
                maxY: shape.y + shape.radius,
                width: shape.radius * 2,
                height: shape.radius * 2
            };
        } else if (shape.type === 'polygon' && shape.points.length > 0) {
            const xs = shape.points.map(p => p.x);
            const ys = shape.points.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            return {
                minX: minX,
                minY: minY,
                maxX: maxX,
                maxY: maxY,
                width: maxX - minX,
                height: maxY - minY
            };
        }
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    static translateShape(shape, dx, dy) {
        const translated = JSON.parse(JSON.stringify(shape));
        if (translated.type === 'circle') {
            translated.x += dx;
            translated.y += dy;
        } else if (translated.type === 'polygon') {
            translated.points = translated.points.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
        } else if (translated.type === 'rectangle') {
            translated.x += dx;
            translated.y += dy;
        }
        return translated;
    }

    static rotateShape(shape, angle) {
        const rotated = JSON.parse(JSON.stringify(shape));
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        if (rotated.type === 'polygon') {
            rotated.points = rotated.points.map(p => ({
                x: p.x * cos - p.y * sin,
                y: p.x * sin + p.y * cos
            }));
        } else if (rotated.type === 'rectangle') {
            // For rectangles, rotation is more complex but we can handle simple cases
            if (angle === 90 || angle === 270) {
                const temp = rotated.width;
                rotated.width = rotated.height;
                rotated.height = temp;
            }
        }
        return rotated;
    }

    static checkCollision(shape1, shape2, padding = 0) {
        const bounds1 = this.getShapeBounds(shape1);
        const bounds2 = this.getShapeBounds(shape2);

        return !(
            bounds1.maxX + padding < bounds2.minX ||
            bounds1.minX - padding > bounds2.maxX ||
            bounds1.maxY + padding < bounds2.minY ||
            bounds1.minY - padding > bounds2.maxY
        );
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
        } else if (shape.type === 'rectangle') {
            return shape.width * shape.height;
        } else if (shape.type === 'polygon') {
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
        const bounds = this.getShapeBounds(shape);
        const centerX = bounds.minX + bounds.width / 2;
        const centerY = bounds.minY + bounds.height / 2;
        return this.translateShape(shape, -centerX, -centerY);
    }

    static generateRotations(shape, numRotations) {
        const rotations = [];
        for (let i = 0; i < numRotations; i++) {
            const angle = (360 / numRotations) * i;
            rotations.push(this.rotateShape(shape, angle));
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
