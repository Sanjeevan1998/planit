const FloatingShapes = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Lavender blob top-right */}
      <div
        className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-30 animate-float"
        style={{ background: 'radial-gradient(circle, hsl(259 100% 85%) 0%, transparent 70%)' }}
      />
      {/* Peach blob mid-left */}
      <div
        className="absolute top-1/3 -left-16 w-64 h-64 rounded-full opacity-20 animate-float-slow"
        style={{ background: 'radial-gradient(circle, hsl(22 100% 87%) 0%, transparent 70%)', animationDelay: '2s' }}
      />
      {/* Mint blob bottom-right */}
      <div
        className="absolute bottom-20 right-1/4 w-48 h-48 rounded-full opacity-25 animate-float"
        style={{ background: 'radial-gradient(circle, hsl(153 62% 83%) 0%, transparent 70%)', animationDelay: '4s' }}
      />
      {/* Baby blue blob bottom-left */}
      <div
        className="absolute bottom-1/4 left-1/3 w-56 h-56 rounded-full opacity-20 animate-float-slow"
        style={{ background: 'radial-gradient(circle, hsl(212 100% 86%) 0%, transparent 70%)', animationDelay: '1s' }}
      />
      {/* Sunflower accent */}
      <div
        className="absolute top-1/2 right-10 w-32 h-32 rounded-full opacity-15 animate-float"
        style={{ background: 'radial-gradient(circle, hsl(44 100% 75%) 0%, transparent 70%)', animationDelay: '3s' }}
      />
    </div>
  );
};

export default FloatingShapes;
