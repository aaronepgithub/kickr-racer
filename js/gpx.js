// Simple GPX generator for ride export
// Exports two functions: generateGPX(runData, gpxData, options) and downloadGPX(gpxString, filename)
export function generateGPX(runData, gpxData, options = {}) {
    // runData: { runnerName, totalTime (s), totalDistance (miles), laps }
    // gpxData: array of points { lat, lon, ele, startDistance } where startDistance is miles from start
    const totalRunDistance = runData.totalDistance || (runData.laps - 1) * (options.courseDistance || (gpxData.length ? gpxData[gpxData.length-1].startDistance : 0)) + (gpxData.length ? gpxData[gpxData.length-1].startDistance : 0);
    const totalTime = runData.totalTime || 0; // seconds

    const now = new Date();
    const endTime = now;
    const startTime = new Date(endTime.getTime() - totalTime * 1000);

    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let xml = '';
    xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<gpx version="1.1" creator="Kickr Racer - exported" xmlns="http://www.topografix.com/GPX/1/1">\n';
    xml += `  <metadata>\n    <name>${escapeXml(runData.runnerName || 'Ride')}</name>\n    <time>${startTime.toISOString()}</time>\n  </metadata>\n`;

    xml += '  <trk>\n';
    xml += `    <name>${escapeXml(options.name || 'Kickr Racer Ride')}</name>\n`;
    xml += '    <trkseg>\n';

    // Determine course length (miles) from gpxData if available
    const courseLength = options.courseDistance || (gpxData.length ? gpxData[gpxData.length-1].startDistance : 0);
    // Guard: if courseLength is zero, avoid division by zero
    const courseLen = courseLength > 0 ? courseLength : 1;

    // For each lap, iterate through points and compute absolute distance along the run
    for (let lap = 1; lap <= (runData.laps || 1); lap++) {
        const lapOffset = (lap - 1) * courseLen; // miles
        for (let i = 0; i < gpxData.length; i++) {
            const p = gpxData[i];
            // absolute distance along run (miles)
            const absDist = lapOffset + (p.startDistance || 0);
            if (absDist > totalRunDistance + 1e-6) break; // don't include points beyond actual run distance

            // time offset proportional to distance covered
            const ratio = totalRunDistance > 0 ? (absDist / totalRunDistance) : 0;
            const t = new Date(startTime.getTime() + Math.round(ratio * totalTime * 1000));

            const lat = p.lat || p.latitude || p[0];
            const lon = p.lon || p.longitude || p[1];
            const ele = (p.ele !== undefined) ? p.ele : '';

            if (lat === undefined || lon === undefined) continue;

            xml += `      <trkpt lat="${lat}" lon="${lon}">\n`;
            if (ele !== '') xml += `        <ele>${ele}</ele>\n`;
            xml += `        <time>${t.toISOString()}</time>\n`;
            xml += '      </trkpt>\n';
        }
    }

    xml += '    </trkseg>\n';
    xml += '  </trk>\n';
    xml += '</gpx>\n';

    return xml;
}

export function downloadGPX(gpxString, filename = 'ride.gpx') {
    const blob = new Blob([gpxString], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
}
