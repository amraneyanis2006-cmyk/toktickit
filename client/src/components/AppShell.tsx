import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

export default function AppShell() {
  const { requester, clearRequester } = useRequester();
  const navigate = useNavigate();

  const handleChangeRequester = () => {
    clearRequester();
    navigate('/select-requester');
  };

  return (
    <div>
      <nav className="zg-header navbar navbar-expand-lg py-2 px-3">
        <div className="container-fluid">
          <span className="navbar-brand fw-semibold d-flex align-items-center gap-2">
            <span aria-hidden="true">🕐</span> TokTickIT
          </span>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#zgNavContent"
            aria-controls="zgNavContent"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="zgNavContent">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <NavLink to="/tickets" className="nav-link">
                  📄 My Tickets
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink to="/tickets/new" className="nav-link">
                  ➕ Create Ticket
                </NavLink>
              </li>
            </ul>

            {requester && (
              <div className="dropdown">
                <button
                  className="btn btn-sm text-white dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  👤 {requester.name}
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li>
                    <button className="dropdown-item" onClick={handleChangeRequester}>
                      Change Requester
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container py-4">
        <Outlet />
      </main>
    </div>
  );
}
