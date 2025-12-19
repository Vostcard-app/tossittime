import React, { useMemo, useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View, Event } from 'react-big-calendar';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { getFoodItemStatus, getStatusColor } from '../utils/statusUtils';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { addDays, startOfDay, format, parse, startOfWeek, getDay } from 'date-fns';
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
    isAdjacentToYellow?: boolean; // Flag for red expiration day adjacent to yellow span
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

      // Helper function to set time to midnight (00:00:00) for top positioning
      const setToMidnight = (date: Date): Date => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
      };
      
      // Helper function to set time to end of day (23:59:59) for proper day spanning
      const setToEndOfDay = (date: Date): Date => {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
      };

      if (status === 'expired') {
        // Red: Show on expiration date and continue showing as red for expired items
        // For day view, show on the expiration date (react-big-calendar will filter by date)
        allEvents.push({
          title: item.name,
          start: setToMidnight(expirationDate),
          end: setToEndOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'expired',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      } else if (status === 'expiring_soon') {
        if (currentView === 'week') {
          // Week view: Create a single spanning yellow event for 3 days before expiration
          const threeDaysBefore = addDays(expirationDate, -3);
          const dayBeforeExpiration = addDays(expirationDate, -1);
          const eventStart = setToMidnight(threeDaysBefore);
          const eventEnd = setToEndOfDay(dayBeforeExpiration);
          
          // Debug: Verify date calculation
          console.log('Expiring soon event date calculation:', {
            item: item.name,
            expirationDate: expirationDate.toISOString(),
            threeDaysBefore: threeDaysBefore.toISOString(),
            dayBeforeExpiration: dayBeforeExpiration.toISOString(),
            eventStart: eventStart.toISOString(),
            eventEnd: eventEnd.toISOString(),
            spanDays: Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
          });
          
          const yellowEvent = {
            title: item.name,
            start: eventStart,
            end: eventEnd,
            resource: {
              itemId: item.id,
              status: 'expiring_soon',
              rowIndex: rowIndex,
            },
          } as CalendarEvent;
          allEvents.push(yellowEvent);
          
          // Red: Show on the expiration date itself (no title - adjacent to yellow span)
          allEvents.push({
            title: '', // Empty title since it's adjacent to yellow span
            start: setToMidnight(expirationDate),
            end: setToEndOfDay(expirationDate),
            resource: {
              itemId: item.id,
              status: 'expired', // Use expired status for red color on expiration day
              rowIndex: rowIndex,
              isAdjacentToYellow: true, // Flag to indicate this is adjacent to yellow span
            },
          } as CalendarEvent);
        } else {
          // Day/month view: Create individual events for each day
          for (let i = 3; i >= 1; i--) {
            const dayBefore = addDays(expirationDate, -i);
            allEvents.push({
              title: item.name,
              start: setToMidnight(dayBefore),
              end: setToEndOfDay(dayBefore),
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
            start: setToMidnight(expirationDate),
            end: setToEndOfDay(expirationDate),
            resource: {
              itemId: item.id,
              status: 'expired', // Use expired status for red color on expiration day
              rowIndex: rowIndex,
            },
          } as CalendarEvent);
        }
        rowIndex++;
      } else {
        // Green (fresh): Single day on expiration date
        allEvents.push({
          title: item.name,
          start: setToMidnight(expirationDate),
          end: setToEndOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'fresh',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      }
    });

    // Debug: Log all events by status
    const expiringSoonEvents = allEvents.filter(e => e.resource.status === 'expiring_soon');
    const expiredEvents = allEvents.filter(e => e.resource.status === 'expired');
    console.log('Calendar events summary:', {
      total: allEvents.length,
      expiring_soon: expiringSoonEvents.length,
      expired: expiredEvents.length,
      expiring_soon_events: expiringSoonEvents,
      currentView: currentView
    });

    return allEvents;
  }, [foodItems, currentView]);

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
    
    // Add data attribute for CSS targeting
    const className = `calendar-event-${event.resource.status}`;

    // Position events vertically by row index in day/week views
    // Start from top (0px) and stack downward based on expiration proximity
    // Items closest to expiring (rowIndex 0) appear at the top
    if (currentView === 'day' || currentView === 'week') {
      const rowIndex = event.resource.rowIndex ?? 0;
      const rowHeight = 44; // Height per row in pixels
      const topPosition = rowIndex * rowHeight;
      // Force top position - this must override react-big-calendar's time-based positioning
      baseStyle.top = `${topPosition}px`;
      baseStyle.position = 'absolute' as React.CSSProperties['position'];
      baseStyle.bottom = 'auto';
      baseStyle.marginTop = '0px';
      // Set CSS variable for additional CSS override support
      (baseStyle as any)['--rbc-event-top'] = `${topPosition}px`;
      // Ensure z-index so events appear above grid lines
      baseStyle.zIndex = 1;
      // For week view, ensure spanning events can span multiple days
      if (currentView === 'week') {
        // Don't force width/left/right for spanning events - let react-big-calendar handle it
        baseStyle.width = 'auto';
        baseStyle.left = 'auto';
        baseStyle.right = 'auto';
      }
    }

    return {
      style: baseStyle,
      className: className,
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
    
    // Week view: show title only if not empty (red expiration day adjacent to yellow has empty title)
    if (event.resource.isAdjacentToYellow) {
      return <div style={{ padding: '2px 4px' }}></div>; // Empty div for red expiration day
    }
    // Show title for all other events (including yellow spanning events)
    return <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</div>;
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
        align-items: flex-start !important;
        margin-top: 0 !important;
      }
      .rbc-time-view .rbc-event {
        position: absolute !important;
        height: 40px !important;
        margin: 0 !important;
        margin-top: 0 !important;
        transform: none !important;
        /* Force events to use inline style top positioning from eventStyleGetter */
        /* Override any time-based positioning from react-big-calendar */
        top: var(--rbc-event-top, 0) !important;
        /* For multi-day spanning events, react-big-calendar handles left/right/width automatically */
        /* Don't force width: 100% as it breaks spanning events */
        display: flex !important;
        align-items: center !important;
        z-index: 1 !important;
      }
      /* Single day events should still be full width */
      .rbc-time-view .rbc-event:not(.rbc-event-continues-after):not(.rbc-event-continues-prior):not(.rbc-event-continues-earlier) {
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
      }
      /* Ensure spanning events are visible and properly styled - let react-big-calendar handle positioning */
      .rbc-time-view .rbc-event.rbc-event-continues-after,
      .rbc-time-view .rbc-event.rbc-event-continues-prior,
      .rbc-time-view .rbc-event.rbc-event-continues-earlier {
        /* Let react-big-calendar handle left/right/width for spanning events */
        /* But ensure they're visible */
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Ensure all events with expiring_soon status are visible */
      .rbc-time-view .rbc-event.calendar-event-expiring_soon {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        background-color: #f59e0b !important;
      }
      /* Debug: Make sure yellow events are visible */
      .rbc-time-view .rbc-event[style*="rgb(245, 158, 11)"],
      .rbc-time-view .rbc-event[style*="#f59e0b"] {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Override react-big-calendar's time-based top calculation - more specific selectors */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event {
        top: var(--rbc-event-top, 0) !important;
        margin-top: 0 !important;
      }
      /* Force all events to start from top, ignoring time-based calculations */
      .rbc-time-view .rbc-time-content .rbc-day-slot .rbc-events-container {
        top: 0 !important;
        padding-top: 0 !important;
      }
      /* Completely override react-big-calendar's time-based positioning */
      /* Use attribute selector to target events with our CSS variable */
      .rbc-time-view .rbc-event[style*="--rbc-event-top"] {
        /* Our inline style should take precedence */
      }
      /* Force events container to start at top of day slot */
      .rbc-time-view .rbc-day-slot .rbc-events-container {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: auto !important;
      }
      /* Make sure day slots don't have excessive height pushing events down */
      .rbc-time-view .rbc-day-slot {
        height: auto !important;
        min-height: 200px !important;
      }
      /* Override react-big-calendar's default time-based positioning */
      .rbc-time-view .rbc-event-label {
        display: none !important;
      }
      /* Reset any default top positioning from react-big-calendar */
      .rbc-time-view .rbc-time-content {
        padding-top: 0 !important;
      }
      /* Ensure events start from the very top */
      .rbc-time-view .rbc-time-slot {
        padding-top: 0 !important;
      }
      .rbc-time-view .rbc-time-gutter {
        display: none !important;
      }
      /* Override any time-based positioning from react-big-calendar */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event {
        /* Remove any default top positioning that react-big-calendar might add */
        top: var(--rbc-event-top, 0) !important;
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
