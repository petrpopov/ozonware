import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ToastHost from './components/ToastHost.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ReceiptPage from './pages/ReceiptPage.jsx';
import ShipmentPage from './pages/ShipmentPage.jsx';
import WriteoffPage from './pages/WriteoffPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProductCardPage from './pages/ProductCardPage.jsx';
import PlannedSuppliesPage from './pages/PlannedSuppliesPage.jsx';
import PlannedSupplyDetailPage from './pages/PlannedSupplyDetailPage.jsx';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/catalog" element={<ProductsPage catalogMode />} />
          <Route path="/products/:id" element={<ProductCardPage />} />
          <Route path="/receipt" element={<ReceiptPage />} />
          <Route path="/planned-supplies" element={<PlannedSuppliesPage />} />
          <Route path="/planned-supplies/:id" element={<PlannedSupplyDetailPage />} />
          <Route path="/shipment" element={<ShipmentPage />} />
          <Route path="/writeoff" element={<WriteoffPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}
