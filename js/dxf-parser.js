/**
 * DXF parser for basic 2D nesting entities.
 * Supports CIRCLE, LINE, LWPOLYLINE and POLYLINE(VERTEX/SEQEND).
 */
class DXFParser {
    static parse(dxfText) {
        const tokens = dxfText
            .replace(/\r/g, '')
            .split('\n')
            .map(line => line.trim());

        const entities = [];
        let inEntities = false;
        let i = 0;

        while (i < tokens.length - 1) {
            const code = tokens[i];
            const value = tokens[i + 1] || '';

            if (code === '2' && value.toUpperCase() === 'ENTITIES') {
                inEntities = true;
                i += 2;
                continue;
            }

            if (inEntities && code === '0' && value.toUpperCase() === 'ENDSEC') {
                break;
            }

            if (!inEntities) {
                i += 2;
                continue;
            }

            if (code !== '0') {
                i += 2;
                continue;
            }

            const entityType = value.toUpperCase();

            if (entityType === 'CIRCLE') {
                const parsed = this.parseCircle(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'LINE') {
                const parsed = this.parseLine(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'LWPOLYLINE') {
                const parsed = this.parseLwPolyline(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'POLYLINE') {
                const parsed = this.parsePolyline(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'ARC') {
                const parsed = this.parseArc(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'SOLID') {
                const parsed = this.parseSolid(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            if (entityType === 'RECT' || entityType === 'RECTANGLE') {
                const parsed = this.parseRectangle(tokens, i + 2);
                if (parsed.entity) entities.push(parsed.entity);
                i = parsed.nextIndex;
                continue;
            }

            i += 2;
        }

        return this.processEntities(entities);
    }

    static parseCircle(tokens, startIndex) {
        let x = null;
        let y = null;
        let radius = null;
        let i = startIndex;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) x = parseFloat(value);
            if (code === 20) y = parseFloat(value);
            if (code === 40) radius = parseFloat(value);

            i += 2;
        }

        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(radius) && radius > 0) {
            return { entity: { type: 'circle', x, y, radius }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static parseLine(tokens, startIndex) {
        let x1 = null;
        let y1 = null;
        let x2 = null;
        let y2 = null;
        let i = startIndex;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) x1 = parseFloat(value);
            if (code === 20) y1 = parseFloat(value);
            if (code === 11) x2 = parseFloat(value);
            if (code === 21) y2 = parseFloat(value);

            i += 2;
        }

        if (
            Number.isFinite(x1) && Number.isFinite(y1) &&
            Number.isFinite(x2) && Number.isFinite(y2)
        ) {
            return { entity: { type: 'line', x1, y1, x2, y2 }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static parseLwPolyline(tokens, startIndex) {
        let i = startIndex;
        const points = [];
        let currentX = null;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) {
                currentX = parseFloat(value);
            }

            if (code === 20 && currentX !== null) {
                const y = parseFloat(value);
                if (Number.isFinite(currentX) && Number.isFinite(y)) {
                    points.push({ x: currentX, y });
                }
                currentX = null;
            }

            i += 2;
        }

        if (points.length >= 3) {
            return { entity: { type: 'polygon', points }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static parsePolyline(tokens, startIndex) {
        let i = startIndex;
        const points = [];

        while (i < tokens.length - 1) {
            const code = tokens[i];
            const value = (tokens[i + 1] || '').toUpperCase();

            if (code === '0' && value === 'SEQEND') {
                i += 2;
                break;
            }

            if (code === '0' && value === 'VERTEX') {
                const vertex = this.parseVertex(tokens, i + 2);
                if (vertex.point) points.push(vertex.point);
                i = vertex.nextIndex;
                continue;
            }

            i += 2;
        }

        if (points.length >= 3) {
            return { entity: { type: 'polygon', points }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static parseVertex(tokens, startIndex) {
        let x = null;
        let y = null;
        let i = startIndex;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) x = parseFloat(value);
            if (code === 20) y = parseFloat(value);

            i += 2;
        }

        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { point: { x, y }, nextIndex: i };
        }

        return { point: null, nextIndex: i };
    }

    static parseRectangle(tokens, startIndex) {
        let x = null;
        let y = null;
        let width = null;
        let height = null;
        let i = startIndex;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) x = parseFloat(value);
            if (code === 20) y = parseFloat(value);
            if (code === 40) width = parseFloat(value);
            if (code === 41) height = parseFloat(value);

            i += 2;
        }

        if (
            Number.isFinite(x) && Number.isFinite(y) &&
            Number.isFinite(width) && Number.isFinite(height)
        ) {
            return { entity: { type: 'rectangle', x, y, width, height }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static parseArc(tokens, startIndex) {
        let x = null;
        let y = null;
        let radius = null;
        let startAngle = null;
        let endAngle = null;
        let i = startIndex;

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = tokens[i + 1];

            if (code === 10) x = parseFloat(value);
            if (code === 20) y = parseFloat(value);
            if (code === 40) radius = parseFloat(value);
            if (code === 50) startAngle = parseFloat(value);
            if (code === 51) endAngle = parseFloat(value);

            i += 2;
        }

        if (
            Number.isFinite(x) && Number.isFinite(y) &&
            Number.isFinite(radius) && radius > 0 &&
            Number.isFinite(startAngle) && Number.isFinite(endAngle)
        ) {
            return {
                entity: { type: 'arc', x, y, radius, startAngle, endAngle },
                nextIndex: i
            };
        }

        return { entity: null, nextIndex: i };
    }

    static parseSolid(tokens, startIndex) {
        const points = [];
        let i = startIndex;
        const xValues = {};
        const yValues = {};

        while (i < tokens.length - 1) {
            if (tokens[i] === '0') break;
            const code = parseInt(tokens[i], 10);
            const value = parseFloat(tokens[i + 1]);

            if (code >= 10 && code <= 13) {
                xValues[code - 10] = value;
            }

            if (code >= 20 && code <= 23) {
                yValues[code - 20] = value;
            }

            i += 2;
        }

        for (let idx = 0; idx < 4; idx++) {
            if (Number.isFinite(xValues[idx]) && Number.isFinite(yValues[idx])) {
                points.push({ x: xValues[idx], y: yValues[idx] });
            }
        }

        if (points.length >= 3) {
            return { entity: { type: 'polygon', points }, nextIndex: i };
        }

        return { entity: null, nextIndex: i };
    }

    static processEntities(entities) {
        const shapes = [];
        const lines = [];

        for (const entity of entities) {
            if (entity.type === 'circle') {
                shapes.push(Geometry.createCircle(entity.x, entity.y, entity.radius));
            } else if (entity.type === 'polygon') {
                shapes.push(Geometry.createPolygon(this.cleanPolygonPoints(entity.points)));
            } else if (entity.type === 'rectangle') {
                shapes.push(Geometry.createRectangle(entity.x, entity.y, entity.width, entity.height));
            } else if (entity.type === 'line') {
                lines.push(entity);
            } else if (entity.type === 'arc') {
                const approxLines = this.arcToLineSegments(entity, 18);
                lines.push(...approxLines);
            }
        }

        const polygonsFromLines = this.combineLineSegments(lines);
        for (const polygon of polygonsFromLines) {
            shapes.push(Geometry.createPolygon(this.cleanPolygonPoints(polygon)));
        }

        if (shapes.length === 0 && lines.length > 0) {
            for (const line of lines) {
                const dx = line.x2 - line.x1;
                const dy = line.y2 - line.y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const thickness = Math.max(1, length * 0.03);
                const minX = Math.min(line.x1, line.x2) - thickness / 2;
                const minY = Math.min(line.y1, line.y2) - thickness / 2;

                shapes.push(Geometry.createRectangle(
                    minX,
                    minY,
                    Math.max(length, thickness),
                    thickness
                ));
            }
        }

        return shapes;
    }

    static combineLineSegments(lineSegments) {
        const segments = lineSegments.map((line, idx) => ({ ...line, used: false, idx }));
        const polygons = [];
        const tolerance = 0.5;

        for (const segment of segments) {
            if (segment.used) continue;

            const chain = [
                { x: segment.x1, y: segment.y1 },
                { x: segment.x2, y: segment.y2 }
            ];
            segment.used = true;

            let extended = true;
            while (extended) {
                extended = false;

                for (const candidate of segments) {
                    if (candidate.used) continue;

                    const start = chain[0];
                    const end = chain[chain.length - 1];
                    const p1 = { x: candidate.x1, y: candidate.y1 };
                    const p2 = { x: candidate.x2, y: candidate.y2 };

                    if (this.pointsClose(end, p1, tolerance)) {
                        chain.push(p2);
                        candidate.used = true;
                        extended = true;
                        break;
                    }

                    if (this.pointsClose(end, p2, tolerance)) {
                        chain.push(p1);
                        candidate.used = true;
                        extended = true;
                        break;
                    }

                    if (this.pointsClose(start, p1, tolerance)) {
                        chain.unshift(p2);
                        candidate.used = true;
                        extended = true;
                        break;
                    }

                    if (this.pointsClose(start, p2, tolerance)) {
                        chain.unshift(p1);
                        candidate.used = true;
                        extended = true;
                        break;
                    }
                }
            }

            if (chain.length >= 4 && this.pointsClose(chain[0], chain[chain.length - 1], tolerance)) {
                chain.pop();
                const cleaned = this.cleanPolygonPoints(chain);
                if (cleaned.length >= 3) {
                    polygons.push(cleaned);
                }
            }
        }

        return polygons;
    }

    static cleanPolygonPoints(points) {
        const tolerance = 0.0001;
        const cleaned = [];

        for (const point of points) {
            const isDuplicate = cleaned.some(existing => this.pointsClose(existing, point, tolerance));
            if (!isDuplicate) {
                cleaned.push(point);
            }
        }

        return cleaned;
    }

    static arcToLineSegments(arc, segments = 18) {
        const points = [];
        const startRad = (arc.startAngle * Math.PI) / 180;
        let endRad = (arc.endAngle * Math.PI) / 180;

        if (endRad <= startRad) {
            endRad += Math.PI * 2;
        }

        const step = (endRad - startRad) / Math.max(2, segments);
        for (let i = 0; i <= segments; i++) {
            const angle = startRad + step * i;
            points.push({
                x: arc.x + Math.cos(angle) * arc.radius,
                y: arc.y + Math.sin(angle) * arc.radius
            });
        }

        const lineSegments = [];
        for (let i = 0; i < points.length - 1; i++) {
            lineSegments.push({
                type: 'line',
                x1: points[i].x,
                y1: points[i].y,
                x2: points[i + 1].x,
                y2: points[i + 1].y
            });
        }

        return lineSegments;
    }

    static pointsClose(p1, p2, tolerance = 0.001) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
    }

    static createSampleDXF() {
        return `  0
SECTION
  2
ENTITIES
  0
CIRCLE
  8
0
 10
50.0
 20
50.0
 40
30.0
  0
LWPOLYLINE
  8
0
 90
4
 10
10.0
 20
10.0
 10
90.0
 20
10.0
 10
90.0
 20
90.0
 10
10.0
 20
90.0
  0
CIRCLE
  8
0
 10
200.0
 20
200.0
 40
25.0
  0
ENDSEC
  0
EOF`;
    }
}
