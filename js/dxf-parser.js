/**
 * Simple DXF Parser
 * Supports basic DXF entities (lines, circles, polygons, polylines)
 */
class DXFParser {
    static parse(dxfText) {
        const lines = dxfText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const entities = [];
        
        console.log('DXF Parser: Processing', lines.length, 'lines');
        
        // Find ENTITIES section
        let entityStart = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase() === 'ENTITIES') {
                entityStart = i + 1;
                console.log('Found ENTITIES section at line', i, ', starting parse at', entityStart);
                break;
            }
        }

        if (entityStart === -1) {
            console.warn('No ENTITIES section found in DXF');
            return this.processEntities([]);
        }

        // Parse entities
        let i = entityStart;
        while (i < lines.length) {
            const line = lines[i].toUpperCase();

            if (line === 'ENDSEC') {
                console.log('Found ENDSEC at line', i);
                break;
            }

            // DXF format: code 0 indicates entity type
            const code = parseInt(lines[i]);
            
            if (code === 0 && i + 1 < lines.length) {
                const entityType = lines[i + 1].toUpperCase();
                console.log('Found entity type:', entityType);
                
                if (entityType === 'CIRCLE') {
                    const entity = this.parseCircle(lines, i + 2);
                    if (entity.entity) {
                        console.log('Parsed circle:', entity.entity);
                        entities.push(entity.entity);
                    }
                    i = entity.nextIndex;
                } else if (entityType === 'LINE') {
                    const entity = this.parseLine(lines, i + 2);
                    if (entity.entity) {
                        console.log('Parsed line:', entity.entity);
                        entities.push(entity.entity);
                    }
                    i = entity.nextIndex;
                } else if (entityType === 'LWPOLYLINE' || entityType === 'POLYLINE') {
                    const entity = this.parsePolyline(lines, i + 2);
                    if (entity.entity) {
                        console.log('Parsed polyline with', entity.entity.points.length, 'points');
                        entities.push(entity.entity);
                    }
                    i = entity.nextIndex;
                } else if (entityType === 'RECT' || entityType === 'RECTANGLE') {
                    const entity = this.parseRectangle(lines, i + 2);
                    if (entity.entity) {
                        console.log('Parsed rectangle:', entity.entity);
                        entities.push(entity.entity);
                    }
                    i = entity.nextIndex;
                } else {
                    i += 2;
                }
            } else {
                i++;
            }
        }

        console.log('DXF Parser: Found', entities.length, 'entities');
        const finalShapes = this.processEntities(entities);
        console.log('DXF Parser: processEntities returned:', finalShapes);
        console.log('DXF Parser: returned array is valid:', Array.isArray(finalShapes), 'length:', finalShapes.length);
        return finalShapes;
    }

    static parseLine(lines, startIndex) {
        let x1 = null, y1 = null, x2 = null, y2 = null;
        let i = startIndex;

        while (i < lines.length) {
            const code = parseInt(lines[i]);
            
            if (isNaN(code) || code === 0) break;
            if (i + 1 >= lines.length) break;

            const value = lines[i + 1];
            
            if (code === 8) {} // Layer, skip
            else if (code === 10) x1 = parseFloat(value);
            else if (code === 20) y1 = parseFloat(value);
            else if (code === 30) {} // Z coordinate, ignore
            else if (code === 11) x2 = parseFloat(value);
            else if (code === 21) y2 = parseFloat(value);
            else if (code === 31) {} // Z coordinate, ignore

            i += 2;
        }

        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            return {
                entity: { type: 'line', x1, y1, x2, y2 },
                nextIndex: i
            };
        }
        return { entity: null, nextIndex: i };
    }

    static parseCircle(lines, startIndex) {
        let x = null, y = null, radius = null;
        let i = startIndex;

        while (i < lines.length) {
            const code = parseInt(lines[i]);
            
            if (isNaN(code) || code === 0) break;
            if (i + 1 >= lines.length) break;

            const value = lines[i + 1];

            if (code === 8) {} // Layer, skip
            else if (code === 10) x = parseFloat(value);
            else if (code === 20) y = parseFloat(value);
            else if (code === 30) {} // Z coordinate, ignore
            else if (code === 40) radius = parseFloat(value);

            i += 2;
        }

        if (x !== null && y !== null && radius !== null && radius > 0) {
            return {
                entity: { type: 'circle', x, y, radius },
                nextIndex: i
            };
        }
        return { entity: null, nextIndex: i };
    }

    static parsePolyline(lines, startIndex) {
        const points = [];
        let i = startIndex;
        let currentX = null;

        while (i < lines.length) {
            const code = parseInt(lines[i]);
            
            if (isNaN(code) || code === 0) break;
            if (i + 1 >= lines.length) break;

            if (code === 10) {
                // X coordinate - save it for later when we get Y
                currentX = parseFloat(lines[i + 1]);
                console.log('Found X:', currentX);
            } else if (code === 20 && currentX !== null) {
                // Y coordinate - now we can create the point
                const y = parseFloat(lines[i + 1]);
                if (!isNaN(currentX) && !isNaN(y)) {
                    points.push({ x: currentX, y: y });
                    console.log('Added point:', { x: currentX, y });
                    currentX = null;
                }
            }
            
            i += 2;
        }

        console.log('Polyline parsed with', points.length, 'points:', points);
        
        if (points.length >= 3) {
            return {
                entity: { type: 'polygon', points },
                nextIndex: i
            };
        }
        return { entity: null, nextIndex: i };
    }

    static parseRectangle(lines, startIndex) {
        let x = null, y = null, width = null, height = null;
        let i = startIndex;

        while (i < lines.length) {
            const code = parseInt(lines[i]);
            
            if (isNaN(code) || code === 0) break;
            if (i + 1 >= lines.length) break;

            const value = lines[i + 1];

            if (code === 8) {} // Layer, skip
            else if (code === 10) x = parseFloat(value);
            else if (code === 20) y = parseFloat(value);
            else if (code === 40) width = parseFloat(value);
            else if (code === 41) height = parseFloat(value);

            i += 2;
        }

        if (x !== null && y !== null && width !== null && height !== null) {
            return {
                entity: { type: 'rectangle', x, y, width, height },
                nextIndex: i
            };
        }
        return { entity: null, nextIndex: i };
    }

    static processEntities(entities) {
        const shapes = [];
        const lineSegments = [];

        console.log('Processing', entities.length, 'entities');
        
        entities.forEach((entity, idx) => {
            console.log('Entity', idx, ':', entity);
            
            if (entity.type === 'circle') {
                const shape = Geometry.createCircle(entity.x, entity.y, entity.radius);
                console.log('Created circle shape:', shape);
                shapes.push(shape);
            } else if (entity.type === 'polygon') {
                const shape = Geometry.createPolygon(entity.points);
                console.log('Created polygon shape:', shape);
                shapes.push(shape);
            } else if (entity.type === 'rectangle') {
                const shape = Geometry.createRectangle(entity.x, entity.y, entity.width, entity.height);
                console.log('Created rectangle shape:', shape);
                shapes.push(shape);
            } else if (entity.type === 'line') {
                // Store line segments to combine them later
                lineSegments.push(entity);
                console.log('Added line segment');
            } else {
                console.warn('Unknown entity type:', entity.type);
            }
        });

        // Convert line segments into shapes
        if (lineSegments.length > 0) {
            console.log('Converting', lineSegments.length, 'line segments');
            
            // Try to combine connected lines into polygons
            const polygons = this.combineLineSegments(lineSegments);
            polygons.forEach(polygon => {
                shapes.push(polygon);
            });
            
            // If no polygons created, convert remaining lines to thin rectangles
            if (polygons.length === 0 && lineSegments.length > 0) {
                console.log('Creating rectangles from lines');
                lineSegments.forEach(line => {
                    const dx = line.x2 - line.x1;
                    const dy = line.y2 - line.y1;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const thickness = Math.max(2, length * 0.05); // 5% thickness or min 2mm
                    
                    // Create a thin rectangle representing the line
                    const minX = Math.min(line.x1, line.x2) - thickness / 2;
                    const minY = Math.min(line.y1, line.y2) - thickness / 2;
                    const width = Math.max(length, thickness);
                    const height = thickness;
                    
                    const shape = Geometry.createRectangle(minX, minY, width, height);
                    console.log('Created rectangle from line');
                    shapes.push(shape);
                });
            }
        }

        console.log('Final shapes count:', shapes.length);
        return shapes;
    }

    static combineLineSegments(lineSegments) {
        // Sammle alle Punkte aus allen Linien
        const allPoints = [];
        
        lineSegments.forEach((line, idx) => {
            allPoints.push({ x: line.x1, y: line.y1, lineIdx: idx, pointType: 'start' });
            allPoints.push({ x: line.x2, y: line.y2, lineIdx: idx, pointType: 'end' });
        });

        console.log('Total points from', lineSegments.length, 'lines:', allPoints.length);

        // Finde den Mittelpunkt aller Punkte
        let centerX = 0, centerY = 0;
        allPoints.forEach(p => {
            centerX += p.x;
            centerY += p.y;
        });
        centerX /= allPoints.length;
        centerY /= allPoints.length;

        console.log('Center point:', centerX, centerY);

        // Sortiere Punkte nach Winkel vom Mittelpunkt (Polar Sort)
        const sortedPoints = allPoints.sort((a, b) => {
            const angleA = Math.atan2(a.y - centerY, a.x - centerX);
            const angleB = Math.atan2(b.y - centerY, b.x - centerX);
            return angleA - angleB;
        });

        // Entferne duplizierte/sehr nahe Punkte
        const uniquePoints = [];
        const tolerance = 2.0;
        
        for (let i = 0; i < sortedPoints.length; i++) {
            const p = sortedPoints[i];
            let isDuplicate = false;
            
            // Prüfe gegen bereits hinzugefügte Punkte
            for (let j = 0; j < uniquePoints.length; j++) {
                const existing = uniquePoints[j];
                const dx = p.x - existing.x;
                const dy = p.y - existing.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < tolerance) {
                    isDuplicate = true;
                    break;
                }
            }
            
            if (!isDuplicate) {
                uniquePoints.push({ x: p.x, y: p.y });
            }
        }

        console.log('Unique points after deduplication:', uniquePoints.length);

        // Erstelle ein großes Polygon aus allen Punkten
        if (uniquePoints.length >= 3) {
            console.log('Created single polygon from all', uniquePoints.length, 'points');
            return [Geometry.createPolygon(uniquePoints)];
        }

        return [];
    }

    static pointsClose(p1, p2, tolerance) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy) < tolerance;
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
