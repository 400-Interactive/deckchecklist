<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version1100Date20261013190000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('deckcl_items')) {
			$table = $schema->getTable('deckcl_items');
			if (!$table->hasColumn('duedate')) {
				$table->addColumn('duedate', Types::STRING, [
					'notnull' => false,
					'length' => 10,
					'default' => null,
				]);
			}
		}

		if (!$schema->hasTable('deckcl_assignees')) {
			$table = $schema->createTable('deckcl_assignees');
			$table->addColumn('id', Types::BIGINT, [
				'autoincrement' => true,
				'notnull' => true,
				'unsigned' => true,
			]);
			$table->addColumn('item_id', Types::BIGINT, [
				'notnull' => true,
				'unsigned' => true,
			]);
			$table->addColumn('user_id', Types::STRING, [
				'notnull' => true,
				'length' => 64,
			]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['item_id'], 'dcl_asg_item_idx');
			$table->addUniqueIndex(['item_id', 'user_id'], 'dcl_asg_unique');
		}

		return $schema;
	}
}
