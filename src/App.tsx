import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase/firebaseConfig';
import Layout from './components/layout/Layout';
import LoadingFallback from './components/ui/LoadingFallback';
import { notificationService } from './services/notificationService';
import { useFoodItems } from './hooks/useFoodItems';
import { analyticsService } from './services/analyticsService';
import { useSessionTracking } from './hooks/useSessionTracking';

// Core pages - load immediately (small, frequently used)
import Login from './pages/Login';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';

// Lazy load heavy pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddItem = lazy(() => import('./pages/AddItem'));
const ItemDetail = lazy(() => import('./pages/ItemDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Shop = lazy(() => import('./pages/Shop'));
const EditLists = lazy(() => import('./pages/EditLists'));
const EditItems = lazy(() => import('./pages/EditItems'));
const EditCategories = lazy(() => import('./pages/EditCategories'));
const Admin = lazy(() => import('./pages/Admin'));
const UserGuide = lazy(() => import('./pages/UserGuide'));
const MealProfile = lazy(() => import('./pages/MealProfile'));
const MealPlanner = lazy(() => import('./pages/MealPlanner'));

function App() {
  const [user, loading] = useAuthState(auth);
  const { foodItems } = useFoodItems(user || null);

  // Track sessions and retention
  useSessionTracking();

  // Track funnel visit (app load)
  useEffect(() => {
    if (user) {
      analyticsService.trackFunnel(user.uid, 'funnel_visit', {
        funnelStep: 'visit',
      });
    }
  }, [user]);

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
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/shop" replace />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/*"
          element={
            user ? (
              <Layout>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/shop" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/add" element={<AddItem />} />
                    <Route path="/item/:id" element={<ItemDetail />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/edit-lists" element={<EditLists />} />
                    <Route path="/edit-items" element={<EditItems />} />
                    <Route path="/edit-categories" element={<EditCategories />} />
                    <Route path="/user-guide" element={<UserGuide />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/meal-profile" element={<MealProfile />} />
                    <Route path="/meal-planner" element={<MealPlanner />} />
                    <Route path="*" element={<Navigate to="/shop" replace />} />
                  </Routes>
                </Suspense>
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
