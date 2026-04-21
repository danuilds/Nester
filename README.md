# Nester - Paper Nesting Optimizer

A powerful JavaScript-based tool for optimizing the placement of paper segments and rings on sheets to minimize waste and maximize material utilization.

## Features

- **DXF File Support**: Import paper segment and ring geometries from DXF files
- **Flexible Paper Sizes**: Configure custom paper dimensions (width × height in mm)
- **Margin & Spacing Control**: Set margins from edges and spacing between segments
- **Multiple Orientations**: Support for 1, 2, 4, 8, 16, or 360-degree orientations
- **Intelligent Nesting Algorithm**: Uses bottom-left heuristic with optimization strategies
- **Visual Representation**: Real-time canvas visualization of placement results
- **Detailed Statistics**: Comprehensive metrics including sheet utilization and fitness scores
- **Export Functionality**: Export results to CSV format
- **Responsive Design**: Works on desktop and tablet devices

## Getting Started

### Installation

1. Clone or download this repository
2. Open `index.html` in a modern web browser
3. No server or build process required - runs entirely in the browser

### Usage

1. **Load Geometry**: Click "Upload DXF File" to load paper segment geometries
2. **Configure Settings**:
   - Set paper dimensions (width and height)
   - Configure margins and spacing
   - Choose number of orientations allowed
   - Adjust algorithm parameters if needed
3. **Run Optimization**: Click "Run Optimization" to calculate the best placement
4. **Review Results**:
   - View the visualization on the canvas
   - Check statistics and utilization percentages
   - Navigate between sheets using Next/Previous buttons
5. **Export**: Click "Export Results" to save statistics as CSV

## Paper Size Examples

- **A4**: 210 × 297 mm
- **Letter**: 216 × 279 mm
- **A3**: 297 × 420 mm
- **Custom**: Enter any desired dimensions

## Orientations

- **1**: No rotation (fixed orientation)
- **2**: 0° and 90° rotations
- **4**: 0°, 90°, 180°, 270° rotations
- **8**: 45° step rotations
- **16**: 22.5° step rotations
- **360**: All angle combinations

## Algorithm Details

### Nesting Strategy

The application uses a multi-phase approach:

1. **Greedy Placement**: Shapes are sorted by area (largest first) and placed sequentially
2. **Bottom-Left Heuristic**: Each shape is positioned at the lowest possible location
3. **Sheet Management**: When a shape doesn't fit on the current sheet, a new sheet is created
4. **Rotation Optimization**: Multiple rotations are tested for each shape

### Fitness Calculation

Fitness score considers:
- Material utilization percentage
- Number of sheets used
- Overall efficiency

### Performance

- Handles typical nesting problems with dozens of shapes in seconds
- Suitable for production planning and waste minimization

## DXF File Format

The parser supports common DXF entities:
- **CIRCLE**: Circular parts (x, y, radius)
- **LWPOLYLINE/POLYLINE**: Polygon segments (sequence of points)
- **LINE**: Line segments (from one point to another)

Example DXF structure expected:
```
SECTION
  2
ENTITIES
  0
CIRCLE
  8
0
 10
50.0    (X coordinate)
 20
50.0    (Y coordinate)
 40
30.0    (Radius)
  0
ENDSEC
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Paper Width | 1000 | 100-9999 | Width of paper sheet in mm |
| Paper Height | 1000 | 100-9999 | Height of paper sheet in mm |
| Top Margin | 10 | 0-100 | Margin from top edge in mm |
| Left Margin | 10 | 0-100 | Margin from left edge in mm |
| Segment Spacing | 5 | 0-50 | Minimum spacing between segments in mm |
| Max Sheets | 10 | 1-100 | Maximum number of sheets to use |
| Population Size | 50 | 10-200 | Algorithm population size |
| Generations | 100 | 10-500 | Algorithm iteration count |

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## API Reference

### Core Classes

#### NesterApp
Main application controller managing UI and workflow.

#### Nester
Core nesting algorithm implementation.
```javascript
const nester = new Nester({
    paperWidth: 1000,
    paperHeight: 1000,
    margin: 10,
    padding: 5,
    maxSheets: 10
});
nester.setShapes(shapes);
const solution = nester.solve();
```

#### Geometry
Static utility methods for geometric calculations.
```javascript
Geometry.checkCollision(shape1, shape2, padding);
Geometry.translateShape(shape, dx, dy);
Geometry.rotateShape(shape, angle);
```

#### Visualization
Canvas-based visualization and rendering.
```javascript
const vis = new Visualization(canvasElement);
vis.setDimensions(width, height);
vis.drawSheet(placements, sheetNumber, totalSheets);
```

#### DXFParser
DXF file parsing and entity extraction.
```javascript
const shapes = DXFParser.parse(dxfText);
```

## Performance Tips

1. **Reduce Orientations**: Use fewer orientations for faster computation
2. **Limit Sheets**: Set a reasonable max sheet limit to prevent excessive searching
3. **Optimize Margins**: Keep margins and spacing minimal where possible
4. **Shape Preparation**: Pre-process DXF files to remove unnecessary entities

## Troubleshooting

**Problem**: "No placement data available"
- Solution: Ensure at least one shape is loaded before running optimization

**Problem**: Very low utilization percentage
- Solution: Try increasing the number of orientations allowed

**Problem**: All shapes not placed
- Solution: Increase the "Max Sheets" limit or reduce segment spacing

## Future Enhancements

- [ ] 3D nesting support
- [ ] Advanced genetic algorithm optimization
- [ ] Guillotine cut pattern generation
- [ ] Multi-material support
- [ ] Real-time preview during optimization
- [ ] Integration with ERP systems

## License

Open source - free for personal and commercial use.

## Support

For issues, questions, or suggestions, please refer to the documentation or contact support.

---

**Version**: 1.0.0  
**Last Updated**: 2026  
**Language**: JavaScript ES6+  
**Dependencies**: None (vanilla JavaScript)
