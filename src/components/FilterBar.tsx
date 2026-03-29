const TAG_LABELS: Record<string, string> = {
  'tsl': 'TSL Basics',
  'shader-art': 'Shader Art',
  'compute': 'Compute',
  'scene': 'Scenes',
  'emergent': 'Emergent',
  'data-viz': 'Data Viz',
  'audio': 'Audio',
  'physics': 'Physics',
  'procedural': 'Worlds',
  'retro': 'Retro',
  'organic': 'Nature',
  'math': 'Math Art',
  'game-ready': 'Game Tech',
};

const TAG_ORDER = [
  'tsl',
  'shader-art',
  'compute',
  'scene',
  'emergent',
  'data-viz',
  'audio',
  'physics',
  'procedural',
  'retro',
  'organic',
  'math',
  'game-ready',
];

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTags: Set<string>;
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
  activeTags,
  onTagToggle,
  onClearAll,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const hasFilters = searchQuery.length > 0 || activeTags.size > 0;
  const isFiltered = filteredCount < totalCount;

  return (
    <div className="filter-bar">
      <div className="filter-search-wrapper">
        <svg
          className="filter-search-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="filter-search"
          type="search"
          placeholder={`Search ${totalCount} demos...`}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search demos"
        />
      </div>

      <div className="filter-tags" role="group" aria-label="Filter by category">
        {TAG_ORDER.map((tag) => (
          <button
            key={tag}
            className={`filter-tag${activeTags.has(tag) ? ' active' : ''}`}
            onClick={() => onTagToggle(tag)}
            aria-pressed={activeTags.has(tag)}
          >
            {TAG_LABELS[tag]}
          </button>
        ))}
      </div>

      {(isFiltered || hasFilters) && (
        <div className="filter-info">
          {isFiltered && (
            <span className="filter-count">
              Showing {filteredCount} of {totalCount}
            </span>
          )}
          {hasFilters && (
            <button className="filter-clear" onClick={onClearAll}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
