import { useState } from 'react';
import { demos } from '../lib/registry';
import FilterBar from './FilterBar';

export default function Gallery() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const handleTagToggle = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setSearchQuery('');
    setActiveTags(new Set());
  };

  const filteredDemos = demos.filter((demo) => {
    const matchesSearch =
      searchQuery.length === 0 ||
      demo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demo.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTags =
      activeTags.size === 0 ||
      demo.tags.some((tag) => activeTags.has(tag));

    return matchesSearch && matchesTags;
  });

  return (
    <div className="gallery">
      <header className="gallery-header">
        <h1>ThreeForge</h1>
        <p>
          {demos.length} Three.js WebGPU experiments
          <span className="gallery-header-dot"> &middot; </span>
          Shader art, physics, procedural worlds, and more
        </p>
      </header>

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeTags={activeTags}
        onTagToggle={handleTagToggle}
        onClearAll={handleClearAll}
        totalCount={demos.length}
        filteredCount={filteredDemos.length}
      />

      {filteredDemos.length === 0 ? (
        <div className="filter-empty">
          <p>No demos match your filters.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {filteredDemos.map((demo) => (
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
      )}
    </div>
  );
}
