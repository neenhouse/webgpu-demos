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
