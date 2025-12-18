import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase/firebaseConfig';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AddItem from './pages/AddItem';
import ItemDetail from './pages/ItemDetail';
import Settings from './pages/Settings';
import Calendar from './pages/Calendar';
import Login from './pages/Login';
import { notificationService } from './services/notificationService';
import { useFoodItems } from './hooks/useFoodItems';

function App() {
  const [user, loading] = useAuthState(auth);
  const { foodItems } = useFoodItems(user || null);

  // Request notification permission on mount
  useEffect(() => {
    if (user && notificationService.isSupported()) {
      notificationService.requestPermission();
    }
  }, [user]);

  // Check for expiring items daily
  useEffect(() => {
    if (!user || !foodItems.length) return;

    const checkExpiringItems = async () => {
      // Check once per day
      const lastCheck = localStorage.getItem('lastExpirationCheck');
      const now = new Date().toDateString();
      
      if (lastCheck !== now) {
        // Get user settings for reminder days
        const reminderDays = 7; // Default, could be loaded from settings
        await notificationService.checkAndSendReminders(foodItems, reminderDays);
        localStorage.setItem('lastExpirationCheck', now);
      }
    };

    checkExpiringItems();
    
    // Check every hour
    const interval = setInterval(checkExpiringItems, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, foodItems]);

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route
          path="/*"
          element={
            user ? (
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/add" element={<AddItem />} />
                  <Route path="/item/:id" element={<ItemDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
