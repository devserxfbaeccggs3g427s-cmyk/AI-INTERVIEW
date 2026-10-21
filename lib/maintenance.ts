/** Process-local admission gate for database mutations and maintenance restores.
 *
 * Acquisition is synchronous so a restore cannot slip between checking the
 * active operations and admitting a request on the same JS event loop. The
 * caller owns the lease across every await and must release it in finally.
 * This deliberately does not coordinate separate Node processes.
 */
let activeOperations = 0;
let maintenanceActive = false;

export function enterOperation(): (() => void) | null {
    if (maintenanceActive) return null;
    activeOperations += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        activeOperations -= 1;
    };
}

export function enterMaintenance(): (() => void) | null {
    if (maintenanceActive || activeOperations !== 0) return null;
    maintenanceActive = true;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        maintenanceActive = false;
    };
}
