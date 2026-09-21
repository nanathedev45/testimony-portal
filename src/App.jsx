import { Routes, Route } from 'react-router-dom';
import './App.css';
import SubmitView from './components/SubmitView';
import AdminView from './components/AdminView';
import logo from './assets/church-logo.jpg';

function App() {
    return (
        <>
            <header className="app-header">
                <img
                    src={logo}
                    alt="Assemblies of God, Ghana - Faith Assembly, Nungua"
                    className="church-logo"
                />
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