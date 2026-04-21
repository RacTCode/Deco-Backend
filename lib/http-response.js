export const sendSuccess = (res, status, payload = {}) => {
  return res.status(status).json({
    ok: true,
    ...payload,
  });
};

export const sendError = (res, status, code, message, details) => {
  const body = {
    ok: false,
    message,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  return res.status(status).json(body);
};