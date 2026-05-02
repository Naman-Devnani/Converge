import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Session from './pages/Session';

export default function App() {
  return (
    <Routes>
      <Route path="/"             element={<Home />} />
      <Route path="/session/:id"  element={<Session />} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  );
}
