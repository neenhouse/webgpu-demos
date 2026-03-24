import { Suspense, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WebGPURenderer } from 'three/webgpu';
import { WebGLRenderer } from 'three';
import { getDemoByName, getAdjacentDemos, type DemoEntry } from '../lib/registry';
import { isWebGPUAvailable } from '../lib/webgpu-detect';

function DemoNotFound({ name }: { name: string }) {
  return (
    <div className="viewer-message">
      <h2>Demo not found</h2>
      <p>No demo called "{name}" exists.</p>
      <a href="/">Back to gallery</a>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="viewer-message">
      <p>Loading demo…</p>
    </div>
  );
}

interface OverlayProps {
  demo: DemoEntry;
  isWebGPU: boolean;
}

function Overlay({ demo, isWebGPU }: OverlayProps) {
  const [visible, setVisible] = useState(true);
  const { prev, next } = getAdjacentDemos(demo.name);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prev) window.location.hash = prev.name;
      if (e.key === 'ArrowRight' && next) window.location.hash = next.name;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  return (
    <div
      className={`viewer-overlay ${visible ? 'visible' : 'hidden'}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <div className="overlay-top">
        <a href="/" className="back-button">
          ← Gallery
        </a>
      </div>
      <div className="overlay-bottom">
        {prev && (
          <a href={`#${prev.name}`} className="nav-button nav-prev">
            ‹ {prev.title}
          </a>
        )}
        <div className="overlay-info">
          <h2>{demo.title}</h2>
          <p>{demo.description}</p>
          {!isWebGPU && (
            <p className="fallback-notice">
              Running in WebGL mode — some effects may differ
            </p>
          )}
        </div>
        {next && (
          <a href={`#${next.name}`} className="nav-button nav-next">
            {next.title} ›
          </a>
        )}
      </div>
    </div>
  );
}

export default function Viewer({ demoName }: { demoName: string }) {
  const [isWebGPU, setIsWebGPU] = useState(true);
  const demo = getDemoByName(demoName);

  useEffect(() => {
    isWebGPUAvailable().then(setIsWebGPU);
  }, []);

  const glCreator = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (props: any) => {
      const available = await isWebGPUAvailable();
      if (available) {
        const renderer = new WebGPURenderer({ ...props, antialias: true });
        await renderer.init();
        return renderer;
      }
      return new WebGLRenderer({ ...props, antialias: true });
    },
    [],
  );

  if (!demo) {
    return <DemoNotFound name={demoName} />;
  }

  const DemoComponent = demo.component;

  return (
    <div className="viewer">
      <Suspense fallback={<LoadingSpinner />}>
        <Canvas
          className="viewer-canvas"
          camera={{ position: [0, 0, 4], fov: 70 }}
          gl={glCreator}
        >
          <DemoComponent />
          <OrbitControls enableDamping />
        </Canvas>
      </Suspense>
      <Overlay demo={demo} isWebGPU={isWebGPU} />
    </div>
  );
}
