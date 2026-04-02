INSERT INTO users (name, email, password_hash, role) VALUES 
('Admin User', 'admin@example.com', '$2b$12$R.S6N7t4b.w3J2P1L6D81u8L5cI3B5H1sX3O0M6x2t1s1v5K8E1R2', 'admin');

INSERT INTO vendors (name, contact_person, phone, email, payment_terms) VALUES
('Tech Supplies Co', 'John Doe', '555-1234', 'john@techsupplies.com', 'Net 30'),
('Office Essentials', 'Jane Smith', '555-5678', 'jane@officeessentials.com', 'Net 15');

INSERT INTO products (name, sku, category, unit, current_stock, reorder_level, reorder_quantity, vendor_id) VALUES
('Laptop Pro', 'TEC-LAP-001', 'Electronics', 'pcs', 50, 10, 20, 1),
('Wireless Mouse', 'TEC-MOU-002', 'Electronics', 'pcs', 150, 30, 50, 1),
('Printer Paper A4', 'OFF-PAP-001', 'Office Supplies', 'reams', 200, 50, 100, 2);
