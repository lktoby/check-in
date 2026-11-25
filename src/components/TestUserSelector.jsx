
const testUsers = [
  {
    userId: "test-senior-001",
    displayName: "テスト高齢者A",
    role: "senior",
  },
  {
    userId: "test-guardian-001",
    displayName: "テスト保護者A",
    role: "guardian",
  },
  {
    userId: "test-senior-002",
    displayName: "テスト高齢者B",
    role: "senior",
  },
  {
    userId: "test-guardian-002",
    displayName: "テスト保護者B",
    role: "guardian",
  },
];

function TestUserSelector({ onSelect }) {
  return (
    <div className="container mt-4">
      <h2>テストユーザー選択</h2>
      <p>動作確認に使用するユーザーを選択してください。</p>

      <div className="d-grid gap-3">
        {testUsers.map((user) => (
          <button
            key={user.userId}
            className="btn btn-outline-success"
            onClick={() =>
              onSelect({
                userId: user.userId,
                displayName: user.displayName,
                role: user.role,
              })
            }
          >
            {user.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TestUserSelector;
