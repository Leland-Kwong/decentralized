const ns = 'lucidbyte';

const session = {
  set(sessionParams = {
    accessToken: '', expiresAt: 0, userId: '', duration: ''
  }) {
    const session = JSON.stringify(sessionParams);
    localStorage.setItem(ns, session);
    return sessionParams;
  },
  get() {
    try {
      return JSON.parse(localStorage.getItem(ns)) || {};
    } catch(err) {
      return {};
    }
  },
  remove() {
    localStorage.removeItem(ns);
  },
  end: () => session.remove(),
  exists: () => !!session.get().accessToken,
  isExpired: () => (
    session.exists()
      ? session.get().expiresAt - new Date().getTime() < 0
      : true
  )
};

export default session;
