# Generated by Django 2.2.7 on 2021-02-27 00:01

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('kpi', '0032_asset_export_settings_model'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='exporttask',
            options={'ordering': ['-date_created']},
        ),
    ]
