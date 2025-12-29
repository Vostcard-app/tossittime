import React from 'react';
import { useNavigate } from 'react-router-dom';

const Terms: React.FC = () => {
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
          Terms and Conditions
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
              1. Introduction
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              Welcome to TossItTime. These Terms and Conditions ("Terms") govern your use of our food expiration tracking service. By accessing or using TossItTime, you agree to be bound by these Terms.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              2. User Agreement
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              By creating an account and using TossItTime, you agree to:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>Provide accurate and complete information when registering</li>
              <li>Maintain the security of your account credentials</li>
              <li>Use the service only for lawful purposes</li>
              <li>Not share your account with others</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              3. Use of Service
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              TossItTime is designed to help you track food expiration dates. You are responsible for:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li>Accurately entering food item information</li>
              <li>Verifying expiration dates independently</li>
              <li>Making your own decisions about food safety</li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>
              TossItTime provides suggestions and reminders, but you are solely responsible for food safety decisions.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              4. Account Responsibilities
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              You are responsible for maintaining the confidentiality of your account and password. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              5. Limitation of Liability
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              TossItTime is provided "as is" without warranties of any kind. We are not liable for any damages resulting from your use of the service, including but not limited to food safety issues.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              6. Changes to Terms
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              We reserve the right to modify these Terms at any time. Continued use of the service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
              7. Contact Information
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              If you have questions about these Terms, please contact us at info@vostcard.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;

