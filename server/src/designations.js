// Bus-side crew (rides with the bus) vs counter/office staff who clock in
// at a fixed location. Bus staff don't check in/out manually in Time
// Management — their attendance is derived automatically from their
// rotation's Live Activity status (see autoAttendance.js + routes/trips.js).
// Keep in sync with the "Bus staff" group in client/src/pages/Staff.jsx.
const BUS_DESIGNATIONS = ["driver", "supervisor", "bus_staff", "helper", "conductor", "mechanic"];

module.exports = { BUS_DESIGNATIONS };
