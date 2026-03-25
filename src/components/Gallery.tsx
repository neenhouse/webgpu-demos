import { demos } from '../lib/registry';

export default function Gallery() {
  return (
    <div className="gallery">
      <header className="gallery-header">
        <h1>WebGPU Demos</h1>
        <p>Experiments with Three.js WebGPURenderer</p>
      </header>
      <div className="gallery-grid">
        {demos.map((demo) => (
          <a
            key={demo.name}
            href={`#${demo.name}`}
            className="demo-card"
            style={
              {
                '--accent': demo.color,
              } as React.CSSProperties
            }
          >
            <div className="demo-card-preview">
              <img
                src={`/thumbnails/${demo.name}.jpg`}
                alt={demo.title}
                className="demo-card-thumb"
                loading="lazy"
              />
              {demo.requiresWebGPU && (
                <span className="webgpu-badge">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 1L10.5 3.5V8.5L6 11L1.5 8.5V3.5L6 1Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="0.8"/>
                  </svg>
                  GPU Compute
                </span>
              )}
            </div>
            <div className="demo-card-info">
              <h3>{demo.title}</h3>
              <p>{demo.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
