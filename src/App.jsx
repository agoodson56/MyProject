import { useState, useEffect } from 'react';
import LVTakeoffSystem from '../LV-Takeoff-App.jsx';
import AdminPanel from './components/AdminPanel.jsx';

function App() {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        // Check if we're on the admin route
        const checkRoute = () => {
            const hash = window.location.hash;
            const path = window.location.pathname;
            setIsAdmin(hash === '#admin' || path === '/admin');
        };

        checkRoute();
        window.addEventListener('hashchange', checkRoute);
        window.addEventListener('popstate', checkRoute);

        return () => {
            window.removeEventListener('hashchange', checkRoute);
            window.removeEventListener('popstate', checkRoute);
        };
    }, []);

    // Secret admin route
    if (isAdmin) {
        return <AdminPanel />;
    }

    return <LVTakeoffSystem />;
}

export default App;
