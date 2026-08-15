import { useState } from 'react';

interface Category {
  id: number;
  name: string;
}

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckSystem = async () => {
    setLoading(true);
    setError(null);
    setSystemStatus(null);
    setCategories([]);

    try {
      // 1. Health check call
      const healthRes = await fetch('http://localhost:3000/api/health');
      if (!healthRes.ok) throw new Error('Unable to connect to TokTickIT API');
      const healthData = await healthRes.json();

      // 2. Fetch categories
      const catRes = await fetch('http://localhost:3000/api/categories');
      if (!catRes.ok) throw new Error('Unable to fetch categories');
      const catData = await catRes.json();

      setSystemStatus(healthData.status === 'ok' ? 'System Status: Online' : 'System Status: Warning');
      setCategories(catData);
    } catch (err: any) {
      setError('Unable to connect to TokTickIT API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '3rem', fontFamily: 'Arial, sans-serif', maxWidth: '800px' }}>
      <h1 style={{ fontSize: '2.2rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        TokTickIT IT Service Desk
      </h1>

      <button
        onClick={handleCheckSystem}
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          cursor: 'pointer',
          borderRadius: '4px',
          border: '1px solid #ccc',
          backgroundColor: '#f8f9fa',
          marginBottom: '1.5rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        🔍 Check System
      </button>

      {loading && <p style={{ marginTop: '1rem' }}>Checking system...</p>}

      {/* Success Case */}
      {systemStatus && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✅ {systemStatus}
          </p>
          <h3 style={{ marginTop: '1.5rem', marginBottom: '0.8rem', fontWeight: 'bold' }}>
            Supported Request Categories:
          </h3>
          <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
            {categories.map((cat) => (
              <li key={cat.id}>{cat.name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Failure Case */}
      {error && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem 1.5rem',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '6px',
            maxWidth: '500px'
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold' }}>System Status: Offline</p>
          <p style={{ margin: '4px 0 0 0' }}>{error}</p>
        </div>
      )}
    </div>
  );
}