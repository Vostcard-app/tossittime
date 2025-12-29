import React from 'react';
import { useNavigate } from 'react-router-dom';

const Privacy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '2rem 1rem'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
        <button
          onClick={() => navigate('/login')}
          style={{
            background: 'none',
            border: 'none',
            color: '#002B4D',
            cursor: 'pointer',
            fontSize: '0.875rem',
            textDecoration: 'underline',
            marginBottom: '1.5rem',
            padding: 0
          }}
        >
          ← Back to Login
        </button>

        <h1 style={{
          margin: '0 0 1.5rem 0',
          fontSize: '2rem',
          fontWeight: '700',
          color: '#1f2937'
        }}>
          Privacy Policy
        </h1>

        <div style={{
          color: '#374151',
          lineHeight: '1.6',
          fontSize: '1rem'
        }}>
          <p style={{ marginBottom: '1rem' }}>
            <strong>Last Updated:</strong> {new Date().toLocaleDateString()}
          </p>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              1. Information We Collect
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We collect information that you provide directly to us, including:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>Account information (email address, password)</li>
              <li>Food items and expiration dates you enter</li>
              <li>Shopping list items</li>
              <li>User preferences and settings</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              2. How We Use Your Information
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We use the information we collect to:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>Provide and maintain the TossItTime service</li>
              <li>Send you expiration reminders and notifications</li>
              <li>Improve our service and user experience</li>
              <li>Respond to your inquiries and support requests</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              3. Data Storage and Security
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              Your data is stored securely using Firebase, which provides industry-standard security measures. We implement appropriate technical and organizational measures to protect your personal information.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              4. Data Sharing
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We do not sell, trade, or rent your personal information to third parties. We may share aggregated, anonymized data for analytical purposes.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              5. Cookies and Tracking
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We use cookies and similar technologies to enhance your experience, analyze usage, and assist with security features. You can control cookie preferences through your browser settings.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              6. Your Rights
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              You have the right to:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>Access your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and data</li>
              <li>Opt out of certain communications</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              7. Children's Privacy
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              TossItTime is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              8. Changes to This Policy
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              9. Contact Us
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              If you have questions about this Privacy Policy, please contact us at info@vostcard.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;

