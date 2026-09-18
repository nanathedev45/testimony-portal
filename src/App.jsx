import { Routes, Route } from 'react-router-dom';
import './App.css';
import SubmitView from './components/SubmitView';
import AdminView from './components/AdminView';

function App() {
    return (
        <>
            <header className="app-header">
                <h1>Wind Of Faith 2026 Anonymous Testimony Portal</h1>
            </header>

            <main className="app-main">
                <Routes>
                    <Route path="/" element={<SubmitView />} />
                    <Route path="/admin" element={<AdminView />} />
                    <Route path="*" element={<p className="muted">Page not found.</p>} />
                </Routes>
            </main>
        </>
    );
}

export default App;