export const PhysicsController = {
     parseGPX(gpxString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxString, "text/xml");
        const points = [];
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        if (trkpts.length === 0) return null;

        for (let i = 0; i < trkpts.length; i++) {
            const ele = trkpts[i].getElementsByTagName("ele")[0];
            if (ele) {
                 points.push({
                    lat: parseFloat(trkpts[i].getAttribute("lat")),
                    lon: parseFloat(trkpts[i].getAttribute("lon")),
                    ele: parseFloat(ele.textContent)
                });
            }
        }

        const routeData = [];
        let totalDistanceKm = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const distanceKm = this.haversineDistance(p1, p2);
            const elevationChangeM = p2.ele - p1.ele;
            let gradient = (distanceKm > 0) ? (elevationChangeM / (distanceKm * 1000)) * 100 : 0;

            routeData.push({
                startDistance: totalDistanceKm * 0.621371, // convert to miles
                distance: distanceKm * 0.621371, // convert to miles
                gradient: isNaN(gradient) ? 0 : gradient,
                ele: p1.ele,
            });
            totalDistanceKm += distanceKm;
        }
         if (points.length > 0) {
            routeData.push({
                startDistance: totalDistanceKm * 0.621371,
                distance: 0,
                gradient: 0,
                ele: points[points.length-1].ele
            });
        }

        return { route: routeData, totalDistance: totalDistanceKm * 0.621371 };
    },
    haversineDistance(p1, p2) {
        const R = 6371; // km
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },
    // Solves for speed in m/s using an iterative approach
    calculateSpeedMps(power, gradient, weightLbs) {
        const riderWeightKg = weightLbs * 0.453592;
        const totalMass = riderWeightKg + 9; // Add bike weight
        const g = 9.81; // Gravity
        const Crr = 0.005; // Coefficient of rolling resistance
        const rho = 1.225; // Air density
        const CdA = 0.32; // Drag coefficient * frontal area

        const grade = gradient / 100;

        // Pre-calculate forces that don't depend on speed
        const forceGravity = totalMass * g * Math.sin(Math.atan(grade));
        const forceRolling = totalMass * g * Math.cos(Math.atan(grade)) * Crr;

        // Iteratively solve for velocity (v)
        // Power = (F_gravity + F_rolling) * v + (0.5 * rho * CdA) * v^3
        let v = 5; // Initial guess for speed in m/s
        for (let i = 0; i < 10; i++) { // 10 iterations is plenty for convergence
            let v_squared = v * v;
            let f_v = (forceGravity + forceRolling) * v + (0.5 * rho * CdA) * v_squared * v - power;
            let f_prime_v = (forceGravity + forceRolling) + (1.5 * rho * CdA) * v_squared;
            v = v - f_v / f_prime_v;
            v = Math.max(0, v); // Speed cannot be negative
        }
        return v;
    }
};
