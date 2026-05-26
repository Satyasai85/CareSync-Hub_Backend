const roleHierarchy = {
  patient: ["patient"],
  doctor: ["doctor"],
  receptionist: ["receptionist"],
  admin: ["admin"]
};

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = (req.header("x-user-role") || "admin").toLowerCase();
    const validRoles = Object.keys(roleHierarchy);

    if (!validRoles.includes(role)) {
      return res.status(401).json({ message: "Missing or invalid x-user-role header." });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }

    req.userRole = role;
    next();
  };
}
