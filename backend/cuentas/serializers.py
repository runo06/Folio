from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

Usuario = get_user_model()


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ["id", "email", "nombre"]
        read_only_fields = fields


class RegistroSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = Usuario
        fields = ["email", "nombre", "password"]

    def validate_email(self, valor):
        valor = Usuario.objects.normalize_email(valor).lower()
        if Usuario.objects.filter(email__iexact=valor).exists():
            raise serializers.ValidationError("Ya existe una cuenta con este correo.")
        return valor

    def validate(self, datos):
        # Los validadores de Django (largo mínimo, contraseñas comunes,
        # parecido al correo...) necesitan ver el usuario para comparar.
        validate_password(datos["password"], user=Usuario(email=datos["email"], nombre=datos.get("nombre", "")))
        return datos

    def create(self, datos):
        return Usuario.objects.create_user(**datos)
