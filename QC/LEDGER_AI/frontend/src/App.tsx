import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import ReviewDocument from './pages/ReviewDocument';
import FrequentTransactions from './pages/FrequentTransactions';
import RandomDocuments from './pages/RandomDocuments';
import GlobalVectorCache from './pages/GlobalVectorCache';
import GlobalKeywordRules from './pages/GlobalKeywordRules';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <NavBar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/review-document" replace />} />
            <Route path="/review-document" element={<ReviewDocument />} />
            <Route path="/frequent-transactions" element={<FrequentTransactions />} />
            <Route path="/random-documents" element={<RandomDocuments />} />
            <Route path="/global-vector-cache" element={<GlobalVectorCache />} />
            <Route path="/global-keyword-rules" element={<GlobalKeywordRules />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;