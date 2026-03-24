import './webgpu-setup';
import { useState, useEffect } from 'react';
import Gallery from './components/Gallery';
import Viewer from './components/Viewer';
import './App.css';

function getHashDemo(): string | null {
  const hash = window.location.hash.slice(1);
  return hash || null;
}

export default function App() {
  const [demoName, setDemoName] = useState<string | null>(getHashDemo);

  useEffect(() => {
    const onHashChange = () => setDemoName(getHashDemo());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (demoName) {
    return <Viewer demoName={demoName} />;
  }

  return <Gallery />;
}
