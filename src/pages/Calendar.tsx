import React, { useMemo, useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View, Event } from 'react-big-calendar';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { getFoodItemStatus, getStatusColor } from '../utils/statusUtils';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { addDays, startOfDay, endOfDay, format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  resource: {
    itemId: string;
    status: 'fresh' | 'expiring_soon' | 'expired';
    rowIndex?: number; // For vertical stacking in day/week views
  };
}

const Calendar: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Convert food items to calendar events
  const events = useMemo<CalendarEvent[]>(() => {
    if (!foodItems.length) return [];

    const allEvents: CalendarEvent[] = [];
    
    // Sort items by how close they are to expiring (soonest first) for proper row ordering
    // Items expiring today should be at the top, then tomorrow, etc.
    const today = startOfDay(new Date());
    const sortedItems = [...foodItems].sort((a, b) => {
      const dateA = new Date(a.expirationDate);
      const dateB = new Date(b.expirationDate);
      const daysUntilA = Math.ceil((dateA.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilB = Math.ceil((dateB.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // Sort by days until expiration (negative = expired, 0 = today, positive = future)
      // Closest to expiring (smallest number) should be first
      return daysUntilA - daysUntilB;
    });

    let rowIndex = 0;

    sortedItems.forEach((item) => {
      const expirationDate = new Date(item.expirationDate);
      const status = getFoodItemStatus(expirationDate, 7); // Using default 7 days for expiring soon

      if (status === 'expired') {
        // Red: Show on expiration date and continue showing as red for expired items
        // For day view, show on the expiration date (react-big-calendar will filter by date)
        allEvents.push({
          title: item.name,
          start: startOfDay(expirationDate),
          end: endOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'expired',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      } else if (status === 'expiring_soon') {
        // Yellow: Create individual events for each of the 3 days leading up to expiration
        // This works for both week and day views
        for (let i = 3; i >= 1; i--) {
          const dayBefore = addDays(expirationDate, -i);
          allEvents.push({
            title: item.name,
            start: startOfDay(dayBefore),
            end: endOfDay(dayBefore),
            resource: {
              itemId: item.id,
              status: 'expiring_soon',
              rowIndex: rowIndex,
            },
          } as CalendarEvent);
        }
        
        // Red: Show on the expiration date itself
        allEvents.push({
          title: item.name,
          start: startOfDay(expirationDate),
          end: endOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'expired', // Use expired status for red color on expiration day
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      } else {
        // Green (fresh): Single day on expiration date
        allEvents.push({
          title: item.name,
          start: startOfDay(expirationDate),
          end: endOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'fresh',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      }
    });

    return allEvents;
  }, [foodItems]);

  // Custom event style function
  const eventStyleGetter = (event: CalendarEvent) => {
    const color = getStatusColor(event.resource.status);
    const backgroundColor = color;
    const borderColor = color;
    const textColor = '#ffffff'; // White text for readability

    const baseStyle: React.CSSProperties = {
      backgroundColor,
      borderColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      padding: '2px 4px',
      fontSize: '0.875rem',
      fontWeight: '500',
    };

    // Position events vertically by row index in day/week views
    // Start from top (0px) and stack downward
    if (currentView === 'day' || currentView === 'week') {
      const rowIndex = event.resource.rowIndex ?? 0;
      const rowHeight = 44; // Height per row in pixels
      baseStyle.top = `${rowIndex * rowHeight}px`;
      baseStyle.position = 'absolute';
      baseStyle.bottom = 'auto';
    }

    return {
      style: baseStyle,
    };
  };

  // Handle event click - navigate to item detail
  const handleSelectEvent = (event: CalendarEvent) => {
    navigate(`/item/${event.resource.itemId}`);
  };

  // Handle date click in month view - switch to day view
  const handleSelectSlot = ({ start }: { start: Date }) => {
    if (currentView === 'month') {
      setCurrentDate(start);
      setCurrentView('day');
    }
  };

  // Custom day cell renderer for month view (to show dots)
  const dayPropGetter = (date: Date) => {
    // Check if any event spans this date
    const dayEvents = events.filter((event) => {
      if (!event.start || !event.end) return false;
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const checkDate = new Date(date);
      
      return checkDate >= eventStart && checkDate <= eventEnd;
    });

    if (dayEvents.length === 0) {
      return {};
    }

    // Get unique statuses for this day
    const statuses = new Set(dayEvents.map((e) => e.resource.status));
    const hasFresh = statuses.has('fresh');
    const hasExpiring = statuses.has('expiring_soon');
    const hasExpired = statuses.has('expired');

    // Store status info in data attributes for CSS
    const statusClasses = [];
    if (hasFresh) statusClasses.push('has-fresh');
    if (hasExpiring) statusClasses.push('has-expiring');
    if (hasExpired) statusClasses.push('has-expired');

    return {
      className: `calendar-day-with-events ${statusClasses.join(' ')}`,
    };
  };

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    if (currentView === 'month') {
      // In month view, show as a small colored dot
      const color = getStatusColor(event.resource.status);
      return (
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: color,
            margin: '0 auto',
            cursor: 'pointer',
          }}
          title={event.title as string}
        />
      );
    }
    
    // In week/day view, show full event with title
    // For day view, also show expiration date
    if (currentView === 'day') {
      // Find the original item to get expiration date
      const item = foodItems.find((i) => i.id === event.resource.itemId);
      const expirationDate = item ? new Date(item.expirationDate) : null;
      const formattedDate = expirationDate ? format(expirationDate, 'MMM d, yyyy') : '';
      
      return (
        <div style={{ padding: '2px 4px', fontSize: '0.875rem' }}>
          <div style={{ fontWeight: '500' }}>{event.title}</div>
          {formattedDate && (
            <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '2px' }}>
              Expires: {formattedDate}
            </div>
          )}
        </div>
      );
    }
    
    // Week view: just show title
    return <div style={{ padding: '2px 4px' }}>{event.title}</div>;
  };

  // Add custom CSS for month view and day view
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'calendar-custom-styles';
    style.textContent = `
      /* Month view styles */
      .rbc-month-view .rbc-event {
        border: none !important;
        background: transparent !important;
        padding: 0 !important;
        margin: 0 auto !important;
        height: auto !important;
        min-height: 0 !important;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .rbc-month-view .rbc-event-content {
        padding: 0 !important;
      }
      .rbc-month-view .rbc-day-slot .rbc-events-container {
        margin: 0 !important;
        display: flex;
        flex-direction: row;
        gap: 2px;
        justify-content: center;
        align-items: center;
        padding-top: 2px;
      }
      
      /* Day and Week view styles - remove time column and make events full-width */
      .rbc-time-view .rbc-time-header {
        display: none !important;
      }
      .rbc-time-view .rbc-time-content {
        border-left: none !important;
      }
      .rbc-time-view .rbc-time-header-content {
        display: none !important;
      }
      .rbc-time-view .rbc-time-slot {
        display: none !important;
      }
      .rbc-time-view .rbc-day-slot {
        min-height: 0 !important;
      }
      .rbc-time-view .rbc-events-container {
        margin-left: 0 !important;
        width: 100% !important;
      }
      .rbc-time-view .rbc-event {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .rbc-time-view .rbc-event-content {
        width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      
      /* Additional week view specific adjustments */
      .rbc-time-view.rbc-week-view .rbc-time-content {
        margin-left: 0 !important;
      }
      .rbc-time-view.rbc-week-view .rbc-day-slot {
        width: 100% !important;
      }
      
      /* Stack events vertically by row index in day/week views */
      .rbc-time-view .rbc-day-slot {
        position: relative;
        min-height: auto !important;
        padding-top: 0 !important;
      }
      .rbc-time-view .rbc-events-container {
        position: relative !important;
        min-height: 200px !important;
        padding-top: 0 !important;
        top: 0 !important;
      }
      .rbc-time-view .rbc-event {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: 40px !important;
        margin: 0 !important;
        transform: none !important;
      }
      /* Override react-big-calendar's default time-based positioning */
      .rbc-time-view .rbc-event-label {
        display: none !important;
      }
      /* Reset any default top positioning from react-big-calendar */
      .rbc-time-view .rbc-time-content {
        padding-top: 0 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existingStyle = document.getElementById('calendar-custom-styles');
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading calendar...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view the calendar.</p>
      </div>
    );
  }

  return (
    <>
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px', // Touch target size for mobile
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
              fontSize: '1.5rem',
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Go to home"
          >
            ⌂
          </button>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff', flex: 1 }}>
            Calendar
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <div style={{ height: '600px', backgroundColor: '#ffffff', borderRadius: '8px', padding: '1rem' }}>
        <BigCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          view={currentView}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayPropGetter}
          components={{
            event: EventComponent,
          }}
          views={['month', 'week', 'day']}
          defaultView="month"
        />
      </div>

      {/* Legend */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Fresh</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Expiring Soon</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Expired</span>
        </div>
      </div>
      </div>
    </>
  );
};

export default Calendar;
